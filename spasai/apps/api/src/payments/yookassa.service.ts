import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { formatKopecks } from '../common/money';
import type { Env } from '../config/env';

const API_URL = 'https://api.yookassa.ru/v3';

/** Ставка НДС по справочнику ЮKassa: 1 — без НДС. */
const VAT_CODE_NONE = 1;

export interface CreatedPayment {
  paymentId: string;
  confirmationUrl: string;
}

/** Тело уведомления ЮKassa (нужные поля). */
export interface YookassaNotification {
  event: string;
  object: {
    id: string;
    status: string;
    paid: boolean;
    amount: { value: string; currency: string };
    metadata?: { orderId?: string };
  };
}

/**
 * Интеграция с ЮKassa (этап 6 ТЗ): создание платежа с фискальным чеком
 * по 54-ФЗ, разбор уведомлений, возвраты.
 *
 * Без ключей магазина сервис выключен — `enabled` возвращает false,
 * и заказы проводятся dev-эндпоинтом.
 */
@Injectable()
export class YookassaService {
  private readonly logger = new Logger(YookassaService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return (
      this.config.get('YOOKASSA_SHOP_ID', { infer: true }).length > 0 &&
      this.config.get('YOOKASSA_SECRET_KEY', { infer: true }).length > 0
    );
  }

  private get authHeader(): string {
    const shopId = this.config.get('YOOKASSA_SHOP_ID', { infer: true });
    const secret = this.config.get('YOOKASSA_SECRET_KEY', { infer: true });
    return `Basic ${Buffer.from(`${shopId}:${secret}`).toString('base64')}`;
  }

  /** Копейки → «299.00», как требует API ЮKassa. */
  private static amount(kopecks: number): string {
    return (kopecks / 100).toFixed(2);
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
        // Идемпотентность: повтор запроса не создаёт второй платёж.
        'Idempotence-Key': randomUUID(),
      },
      body: JSON.stringify(body),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      this.logger.error(`ЮKassa ${path} → ${response.status}: ${JSON.stringify(payload)}`);
      throw ApiException.badRequest(
        'PAYMENT_PROVIDER_ERROR',
        'Платёжный провайдер отклонил операцию',
      );
    }

    return payload as T;
  }

  /**
   * Создание платежа с чеком. Позиции чека: боксы и сервисный сбор
   * отдельными строками — они облагаются по-разному и принадлежат
   * разным получателям.
   */
  async createPayment(
    order: Order,
    context: { boxTitle: string; customerPhone: string },
  ): Promise<CreatedPayment> {
    const returnUrl = this.config.get('YOOKASSA_RETURN_URL', { infer: true });

    const items: unknown[] = [
      {
        description: `Бокс «${context.boxTitle}»`.slice(0, 128),
        quantity: String(order.quantity),
        amount: { value: YookassaService.amount(order.boxPrice), currency: 'RUB' },
        vat_code: VAT_CODE_NONE,
        payment_subject: 'commodity',
        payment_mode: 'full_payment',
      },
    ];

    if (order.serviceFee > 0) {
      items.push({
        description: 'Сервисный сбор',
        quantity: '1',
        amount: { value: YookassaService.amount(order.serviceFee), currency: 'RUB' },
        vat_code: VAT_CODE_NONE,
        payment_subject: 'service',
        payment_mode: 'full_payment',
      });
    }

    const payment = await this.request<{
      id: string;
      confirmation?: { confirmation_url?: string };
    }>('/payments', {
      amount: { value: YookassaService.amount(order.total), currency: 'RUB' },
      capture: true,
      description: `Заказ ${order.id.slice(0, 8)} · Спасай`,
      confirmation: { type: 'redirect', return_url: `${returnUrl}?orderId=${order.id}` },
      metadata: { orderId: order.id },
      receipt: {
        customer: { phone: context.customerPhone.replace('+', '') },
        items,
      },
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      throw ApiException.badRequest(
        'PAYMENT_PROVIDER_ERROR',
        'Платёжный провайдер не вернул ссылку на оплату',
      );
    }

    this.logger.log(
      `Платёж ${payment.id} создан на ${formatKopecks(order.total)} ₽ по заказу ${order.id}`,
    );

    return { paymentId: payment.id, confirmationUrl };
  }

  /** Возврат средств (полный или частичный). */
  async refund(paymentId: string, kopecks: number): Promise<string> {
    const refund = await this.request<{ id: string }>('/refunds', {
      payment_id: paymentId,
      amount: { value: YookassaService.amount(kopecks), currency: 'RUB' },
    });

    this.logger.log(`Возврат ${refund.id}: ${formatKopecks(kopecks)} ₽ по платежу ${paymentId}`);
    return refund.id;
  }
}
