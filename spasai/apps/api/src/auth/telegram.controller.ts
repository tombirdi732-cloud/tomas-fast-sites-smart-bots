import { Body, Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from './auth.decorators';
import { TelegramService } from './telegram.service';

/**
 * Приём обновлений от бота.
 *
 * Адрес публичный — его знает Telegram, но может узнать и кто угодно.
 * Поэтому каждое обновление проверяется по секретному заголовку, который
 * Telegram присылает вместе с запросом: без него подделать нажатие «Старт»
 * и войти чужим аккаунтом было бы можно.
 */
@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService) {}

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    if (!this.telegram.enabled || secret !== this.telegram.webhookSecret) {
      throw new ForbiddenException();
    }

    await this.telegram.handleUpdate(update);
    // Telegram повторяет доставку, пока не получит 200.
    return { ok: true };
  }
}
