import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

/** Код, который всегда принимается в dev-режиме (этап 2 ТЗ). */
export const STUB_CODE = '0000';

/**
 * Текст сообщения. Упоминание сервиса и предупреждение обязательны:
 * без них операторы часто заворачивают шаблон на модерации.
 */
export function buildMessage(code: string): string {
  return `Код для входа в Спасай: ${code}. Никому его не сообщайте.`;
}

/**
 * Отправка SMS с кодом входа.
 *
 * Провайдер выбирается переменной SMS_PROVIDER:
 *   stub  — код всегда 0000, ничего не отправляется (dev);
 *   smsru — sms.ru;
 *   smsc  — smsc.ru.
 *
 * Оба провайдера отвечают JSON и возвращают ошибку не HTTP-статусом,
 * а полем в теле — поэтому разбираем ответ, а не полагаемся на response.ok.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** В режиме заглушки код предсказуем и возвращается клиенту. */
  get isStub(): boolean {
    return this.config.get('SMS_PROVIDER', { infer: true }) === 'stub';
  }

  generateCode(): string {
    if (this.isStub) {
      return STUB_CODE;
    }
    return String(randomInt(0, 10_000)).padStart(4, '0');
  }

  async send(phone: string, code: string): Promise<void> {
    const provider = this.config.get('SMS_PROVIDER', { infer: true });
    const message = buildMessage(code);

    switch (provider) {
      case 'stub':
        this.logger.log(`SMS-заглушка: код для ${phone} — ${code}`);
        return;

      case 'smsru':
        await this.sendViaSmsRu(phone, message);
        return;

      case 'smsc':
        await this.sendViaSmsc(phone, message);
        return;
    }
  }

  /** sms.ru: api_id, ответ { status, status_code, sms: { <phone>: {...} } }. */
  private async sendViaSmsRu(phone: string, message: string): Promise<void> {
    const params = new URLSearchParams({
      api_id: this.config.get('SMS_API_ID', { infer: true }),
      to: phone,
      msg: message,
      json: '1',
    });

    const sender = this.config.get('SMS_SENDER', { infer: true });
    if (sender) params.set('from', sender);

    const response = await fetch('https://sms.ru/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const payload = (await response.json()) as {
      status?: string;
      status_code?: number;
      status_text?: string;
    };

    if (payload.status !== 'OK') {
      // Текст кода в лог не попадает — только причина отказа.
      throw new Error(
        `sms.ru отказал: ${payload.status_code ?? '?'} ${payload.status_text ?? 'без описания'}`,
      );
    }

    this.logger.log(`SMS отправлена на ${SmsService.mask(phone)} через sms.ru`);
  }

  /** smsc.ru: login/psw, fmt=3 — JSON; при ошибке в теле поле error. */
  private async sendViaSmsc(phone: string, message: string): Promise<void> {
    const params = new URLSearchParams({
      login: this.config.get('SMS_LOGIN', { infer: true }),
      psw: this.config.get('SMS_PASSWORD', { infer: true }),
      phones: phone,
      mes: message,
      fmt: '3',
      charset: 'utf-8',
    });

    const sender = this.config.get('SMS_SENDER', { infer: true });
    if (sender) params.set('sender', sender);

    const response = await fetch('https://smsc.ru/sys/send.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const payload = (await response.json()) as {
      error?: string;
      error_code?: number;
      id?: number;
    };

    if (payload.error) {
      throw new Error(`smsc.ru отказал: ${payload.error_code ?? '?'} ${payload.error}`);
    }

    this.logger.log(`SMS отправлена на ${SmsService.mask(phone)} через smsc.ru`);
  }

  /** +79991234567 → +7999***4567. Телефон целиком в логи не пишем (152-ФЗ). */
  private static mask(phone: string): string {
    return phone.length > 8 ? `${phone.slice(0, 5)}***${phone.slice(-4)}` : phone;
  }
}
