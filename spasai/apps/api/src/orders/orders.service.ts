import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Box, BoxStatus, NotificationType, Order, OrderStatus, Prisma } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { BoxErrorCode, OrderErrorCode } from '../common/errors/error-codes';
import { calculateOrderAmounts, formatKopecks } from '../common/money';
import type { Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Заказ ждёт оплаты 10 минут, потом бронь снимается (раздел 7.2 ТЗ). */
export const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

/** Бесплатная отмена — не позже чем за 2 часа до начала выдачи (раздел 7.7 ТЗ). */
export const FREE_CANCELLATION_LEAD_MS = 2 * 60 * 60 * 1000;

/** Сколько раз пробуем сгенерировать неконфликтующий код выдачи. */
const PICKUP_CODE_ATTEMPTS = 10;

type BoxRow = Pick<
  Box,
  'id' | 'merchantId' | 'price' | 'quantityLeft' | 'status' | 'pickupStart' | 'pickupEnd'
>;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Создание заказа с транзакционным резервированием (раздел 7.2 ТЗ).
   *
   * Строка бокса блокируется через SELECT … FOR UPDATE, поэтому два
   * одновременных заказа на последний бокс не могут оба пройти: второй
   * дождётся коммита первого и увидит уже уменьшенный остаток.
   */
  async create(userId: string, boxId: string, quantity: number): Promise<Order> {
    const order = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          merchant_id: string;
          price: number;
          quantity_left: number;
          status: BoxStatus;
          pickup_start: Date;
          pickup_end: Date;
        }>
      >`
        SELECT "id", "merchant_id", "price", "quantity_left", "status", "pickup_start", "pickup_end"
        FROM "boxes"
        WHERE "id" = ${boxId}::uuid
        FOR UPDATE
      `;

      const row = rows[0];
      if (!row) {
        throw ApiException.notFound('Бокс не найден');
      }

      const box: BoxRow = {
        id: row.id,
        merchantId: row.merchant_id,
        price: row.price,
        quantityLeft: row.quantity_left,
        status: row.status,
        pickupStart: row.pickup_start,
        pickupEnd: row.pickup_end,
      };

      if (box.status !== BoxStatus.active) {
        throw ApiException.badRequest(
          BoxErrorCode.BOX_NOT_ACTIVE,
          `Бокс больше не продаётся (статус: ${box.status})`,
        );
      }

      if (box.pickupEnd.getTime() <= Date.now()) {
        throw ApiException.badRequest(
          BoxErrorCode.BOX_NOT_ACTIVE,
          'Окно выдачи уже закончилось',
        );
      }

      if (box.quantityLeft < quantity) {
        throw ApiException.badRequest(
          BoxErrorCode.NOT_ENOUGH_QUANTITY,
          `Осталось ${box.quantityLeft} шт., запрошено ${quantity}`,
          { quantityLeft: box.quantityLeft },
        );
      }

      const merchant = await tx.merchant.findUniqueOrThrow({
        where: { id: box.merchantId },
        select: { commissionRate: true, title: true },
      });

      const settings = await tx.platformSettings.findUnique({ where: { id: 1 } });

      // Сервисный сбор берётся только при онлайн-оплате: в режиме on_pickup
      // покупатель платит заведению напрямую, брать с него нечего.
      const onlinePayments = this.config.get('PAYMENTS_MODE', { infer: true }) === 'online';

      const amounts = calculateOrderAmounts({
        price: box.price,
        quantity,
        serviceFee: onlinePayments ? (settings?.serviceFee ?? 0) : 0,
        commissionRate: Number(merchant.commissionRate),
      });

      const quantityLeft = box.quantityLeft - quantity;

      await tx.box.update({
        where: { id: box.id },
        data: {
          quantityLeft,
          ...(quantityLeft === 0 ? { status: BoxStatus.sold_out } : {}),
        },
      });

      return tx.order.create({
        data: {
          userId,
          boxId: box.id,
          merchantId: box.merchantId,
          quantity,
          boxPrice: box.price,
          serviceFee: amounts.serviceFee,
          total: amounts.total,
          commissionAmount: amounts.commissionAmount,
          status: OrderStatus.pending_payment,
        },
      });
    });

    this.logger.log(
      `Заказ ${order.id}: ${order.quantity} шт. × ${formatKopecks(order.boxPrice)} ₽, ` +
        `итого ${formatKopecks(order.total)} ₽, комиссия ${formatKopecks(order.commissionAmount)} ₽`,
    );

    return order;
  }

  /**
   * Бронь без предоплаты (PAYMENTS_MODE=on_pickup): код выдачи выписывается
   * сразу, покупатель платит на месте. Платформа денег не касается —
   * ни эквайринга, ни кассы, ни агентской схемы.
   */
  async reserveWithoutPayment(orderId: string): Promise<Order> {
    const order = await this.withPickupCode(orderId, OrderStatus.ready, {});
    this.logger.log(
      `Заказ ${orderId} забронирован без предоплаты: ${formatKopecks(order.total)} ₽ на месте, ` +
        `код ${order.pickupCode ?? '—'}`,
    );

    await this.notifications.notify({
      userId: order.userId,
      type: NotificationType.order_paid,
      title: 'Бокс забронирован',
      body: `Код выдачи ${order.pickupCode ?? ''}. Оплата при получении.`,
      data: { orderId: order.id, type: 'order_reserved' },
    });

    return order;
  }

  /**
   * Отметка об оплате: генерируется код выдачи (раздел 7.5 ТЗ).
   * Вызывается вебхуком ЮKassa (этап 6) и dev-эндпоинтом.
   * Идемпотентна: повторный вызов по оплаченному заказу ничего не меняет.
   */
  async markPaid(orderId: string, paymentId: string): Promise<Order> {
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw ApiException.notFound('Заказ не найден');

    if (existing.status !== OrderStatus.pending_payment) {
      if (existing.status === OrderStatus.paid || existing.status === OrderStatus.ready) {
        return existing;
      }
      throw ApiException.badRequest(
        OrderErrorCode.ORDER_NOT_CANCELLABLE,
        `Заказ в статусе ${existing.status} нельзя оплатить`,
      );
    }

    const order = await this.withPickupCode(orderId, OrderStatus.paid, {
      paymentId,
      paidAt: new Date(),
    });

    this.logger.log(
      `Заказ ${orderId} оплачен: ${formatKopecks(order.total)} ₽, код ${order.pickupCode ?? '—'}`,
    );

    await this.notifications.notify({
      userId: order.userId,
      type: NotificationType.order_paid,
      title: 'Заказ оплачен',
      body: `Код выдачи ${order.pickupCode ?? ''}. Покажите его на кассе.`,
      data: { orderId: order.id, type: 'order_paid' },
    });

    return order;
  }

  /**
   * Выписывает шестизначный код выдачи (7.5). Код уникален в рамках заведения
   * за сутки — на коллизию частичного UNIQUE просто берём следующий.
   */
  private async withPickupCode(
    orderId: string,
    status: OrderStatus,
    extra: { paymentId?: string; paidAt?: Date },
  ): Promise<Order> {
    for (let attempt = 0; attempt < PICKUP_CODE_ATTEMPTS; attempt += 1) {
      const pickupCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
      try {
        return await this.prisma.order.update({
          where: { id: orderId },
          data: { status, pickupCode, ...extra },
        });
      } catch (error) {
        const isCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isCodeCollision) throw error;
      }
    }

    throw ApiException.conflict('Не удалось сгенерировать уникальный код выдачи, попробуйте ещё раз');
  }

  /**
   * Отмена покупателем (раздел 7.7 ТЗ). Бесплатно — не позже чем за 2 часа
   * до начала окна выдачи. Позже отмена невозможна: деньги невозвратны.
   */
  async cancelByCustomer(userId: string, orderId: string): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: { box: true },
      });

      if (!order) throw ApiException.notFound('Заказ не найден');

      const cancellable: OrderStatus[] = [OrderStatus.pending_payment, OrderStatus.paid, OrderStatus.ready];
      if (!cancellable.includes(order.status)) {
        throw ApiException.badRequest(
          OrderErrorCode.ORDER_NOT_CANCELLABLE,
          `Заказ в статусе ${order.status} отменить нельзя`,
        );
      }

      const deadline = order.box.pickupStart.getTime() - FREE_CANCELLATION_LEAD_MS;
      if (order.status !== OrderStatus.pending_payment && Date.now() > deadline) {
        throw ApiException.badRequest(
          OrderErrorCode.CANCELLATION_WINDOW_PASSED,
          'Бесплатная отмена возможна не позже чем за 2 часа до начала выдачи',
          { freeCancellationUntil: new Date(deadline).toISOString() },
        );
      }

      await OrdersService.restoreQuantity(tx, order.boxId, order.quantity);

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: order.paidAt ? OrderStatus.refunded : OrderStatus.cancelled,
          cancelledAt: new Date(),
        },
      });

      this.logger.log(
        `Заказ ${order.id} отменён покупателем, возвращено ${order.quantity} шт. в бокс ${order.boxId}`,
      );
      return updated;
    });
  }

  /**
   * Выдача по коду (раздел 5.5 ТЗ). Заведение вводит шестизначный код,
   * заказ переходит в collected.
   */
  async collectByCode(merchantId: string, pickupCode: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: {
        merchantId,
        pickupCode,
        status: { in: [OrderStatus.paid, OrderStatus.ready] },
      },
      include: { box: true },
    });

    if (!order) {
      const collected = await this.prisma.order.findFirst({
        where: { merchantId, pickupCode, status: OrderStatus.collected },
      });
      if (collected) {
        throw ApiException.badRequest(
          OrderErrorCode.ORDER_ALREADY_COLLECTED,
          'Этот заказ уже выдан',
          { collectedAt: collected.collectedAt?.toISOString() },
        );
      }
      throw ApiException.badRequest(OrderErrorCode.PICKUP_CODE_UNKNOWN, 'Код не найден');
    }

    if (Date.now() < order.box.pickupStart.getTime()) {
      throw ApiException.badRequest(
        OrderErrorCode.PICKUP_WINDOW_NOT_OPEN,
        'Окно выдачи ещё не открылось',
        { pickupStart: order.box.pickupStart.toISOString() },
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.collected, collectedAt: new Date() },
    });

    this.logger.log(`Заказ ${order.id} выдан по коду ${pickupCode}`);
    return updated;
  }

  listMine(userId: string, active: boolean): Promise<Order[]> {
    const activeStatuses: OrderStatus[] = [
      OrderStatus.pending_payment,
      OrderStatus.paid,
      OrderStatus.ready,
    ];

    return this.prisma.order.findMany({
      where: {
        userId,
        ...(active ? { status: { in: activeStatuses } } : {}),
      },
      include: { box: true, merchant: { select: { id: true, title: true, address: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOwn(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { box: true, merchant: { select: { id: true, title: true, address: true } } },
    });
    if (!order) throw ApiException.notFound('Заказ не найден');
    return order;
  }

  listForMerchant(merchantId: string, pending: boolean): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        merchantId,
        ...(pending ? { status: { in: [OrderStatus.paid, OrderStatus.ready] } } : {}),
      },
      include: { box: { select: { title: true, pickupStart: true, pickupEnd: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Фоновая задача раздела 7.2: снять бронь с заказов, не оплаченных
   * за 10 минут, и вернуть количество в бокс.
   */
  async releaseUnpaidOrders(): Promise<number> {
    const stale = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        createdAt: { lt: new Date(Date.now() - PAYMENT_WINDOW_MS) },
      },
      select: { id: true, boxId: true, quantity: true },
    });

    let released = 0;
    for (const order of stale) {
      await this.prisma.$transaction(async (tx) => {
        // Повторная проверка внутри транзакции: заказ мог быть оплачен только что.
        const fresh = await tx.order.findFirst({
          where: { id: order.id, status: OrderStatus.pending_payment },
        });
        if (!fresh) return;

        await OrdersService.restoreQuantity(tx, order.boxId, order.quantity);
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.cancelled, cancelledAt: new Date() },
        });
        released += 1;
      });
    }

    if (released > 0) {
      this.logger.log(`Снято броней по неоплаченным заказам: ${released}`);
    }
    return released;
  }

  /**
   * Раздел 7.6: заказ не забрали до конца окна выдачи — статус no_show,
   * деньги не возвращаются, заведение получает свою долю.
   */
  async markNoShows(): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: {
        status: { in: [OrderStatus.paid, OrderStatus.ready] },
        box: { pickupEnd: { lt: new Date() } },
      },
      data: { status: OrderStatus.no_show },
    });

    if (result.count > 0) {
      this.logger.log(`Заказов не забрали: ${result.count}`);
    }
    return result.count;
  }

  /** Возврат количества в бокс: снимает sold_out, если бокс ещё продаётся. */
  private static async restoreQuantity(
    tx: Prisma.TransactionClient,
    boxId: string,
    quantity: number,
  ): Promise<void> {
    const box = await tx.box.findUniqueOrThrow({ where: { id: boxId } });

    const quantityLeft = Math.min(box.quantityTotal, box.quantityLeft + quantity);
    const revive = box.status === BoxStatus.sold_out && box.pickupEnd.getTime() > Date.now();

    await tx.box.update({
      where: { id: boxId },
      data: {
        quantityLeft,
        ...(revive ? { status: BoxStatus.active } : {}),
      },
    });
  }
}
