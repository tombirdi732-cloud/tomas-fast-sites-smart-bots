import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import type { Request } from 'express';

import { Public } from '../auth/auth.decorators';
import type { Env } from '../config/env';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import type { YookassaNotification } from './yookassa.service';

/**
 * Официальные диапазоны, из которых ЮKassa шлёт уведомления.
 * Подписи у вебхука нет, поэтому источник проверяем по IP.
 * https://yookassa.ru/developers/using-api/webhooks
 */
const YOOKASSA_NETWORKS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
  '77.75.154.128/25',
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export function isYookassaAddress(rawIp: string): boolean {
  // ::ffff:185.71.76.1 → 185.71.76.1
  const ip = rawIp.replace(/^::ffff:/, '');
  const address = ipv4ToInt(ip);
  if (address === null) return false;

  return YOOKASSA_NETWORKS.some((network) => {
    const [base = '', bitsRaw = '32'] = network.split('/');
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;

    const bits = Number(bitsRaw);
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (address & mask) >>> 0 === (baseInt & mask) >>> 0;
  });
}

@Controller('webhooks')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Уведомление об оплате. Отвечаем 200 на всё, что разобрали, —
   * иначе ЮKassa будет ретраить сутки. Ошибки логируем.
   */
  @Public()
  @Post('yookassa')
  @HttpCode(HttpStatus.OK)
  async yookassa(
    @Body() notification: YookassaNotification,
    @Req() request: Request,
  ): Promise<{ received: true }> {
    const strict = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const ip = request.ip ?? '';

    if (strict && !isYookassaAddress(ip)) {
      this.logger.warn(`Уведомление с постороннего адреса ${ip} отклонено`);
      throw new BadRequestException('Неизвестный источник уведомления');
    }

    const orderId = notification.object?.metadata?.orderId;
    const paymentId = notification.object?.id;

    if (!orderId || !paymentId) {
      this.logger.warn(`Уведомление без orderId: ${JSON.stringify(notification)}`);
      return { received: true };
    }

    try {
      switch (notification.event) {
        case 'payment.succeeded':
          await this.orders.markPaid(orderId, paymentId);
          break;

        case 'payment.canceled':
          await this.cancelUnpaid(orderId);
          break;

        case 'refund.succeeded':
          await this.prisma.order.updateMany({
            where: { id: orderId, status: { not: OrderStatus.refunded } },
            data: { status: OrderStatus.refunded, cancelledAt: new Date() },
          });
          this.logger.log(`Заказ ${orderId}: возврат подтверждён`);
          break;

        default:
          this.logger.log(`Событие ${notification.event} по заказу ${orderId} пропущено`);
      }
    } catch (error) {
      this.logger.error(
        `Не удалось обработать ${notification.event} по заказу ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { received: true };
  }

  /** Оплата не прошла — снимаем бронь, как это делает фоновая задача 7.2. */
  private async cancelUnpaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, status: OrderStatus.pending_payment },
    });
    if (!order) return;

    await this.prisma.$transaction(async (tx) => {
      const box = await tx.box.findUniqueOrThrow({ where: { id: order.boxId } });
      await tx.box.update({
        where: { id: order.boxId },
        data: { quantityLeft: Math.min(box.quantityTotal, box.quantityLeft + order.quantity) },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.cancelled, cancelledAt: new Date() },
      });
    });

    this.logger.log(`Заказ ${orderId}: оплата отменена, бронь снята`);
  }
}
