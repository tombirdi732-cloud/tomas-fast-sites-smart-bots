import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

/** Код, который всегда принимается в dev-режиме (этап 2 ТЗ). */
export const STUB_CODE = '0000';

/**
 * Отправка SMS. В dev код не отправляется и всегда равен `0000` —
 * это позволяет проходить логин без SMS-провайдера.
 * Боевая интеграция подключается здесь же, за тем же интерфейсом.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get isStub(): boolean {
    return this.config.get('SMS_STUB', { infer: true });
  }

  generateCode(): string {
    if (this.isStub) {
      return STUB_CODE;
    }
    return String(randomInt(0, 10_000)).padStart(4, '0');
  }

  send(phone: string, code: string): Promise<void> {
    if (this.isStub) {
      this.logger.log(`SMS-заглушка: код для ${phone} — ${code}`);
      return Promise.resolve();
    }

    // TODO(этап 9): подключить SMS-провайдера. Пока боевой режим явно
    // падает, чтобы никто не выкатил прод с молчащей отправкой.
    throw new Error('SMS-провайдер не настроен: задайте интеграцию в SmsService.send');
  }
}
