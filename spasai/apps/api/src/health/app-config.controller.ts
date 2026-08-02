import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Public } from '../auth/auth.decorators';
import type { Env } from '../config/env';
import { CANCELLATION_GRACE_MS, FREE_CANCELLATION_LEAD_MS } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

interface AppConfigResponse {
  /** on_pickup — платим на кассе, online — оплата в приложении. */
  paymentsMode: 'on_pickup' | 'online';
  /** Сервисный сбор в копейках. При оплате на месте платформа его не берёт. */
  serviceFee: number;
  /** Отменить заказ можно 15 минут после оформления, миллисекунды. */
  cancellationGraceMs: number;
  /** …и не позже чем за 2 часа до начала выдачи, миллисекунды. */
  cancellationLeadMs: number;
}

/**
 * Настройки, которые приложению нужно знать до первого заказа: берём ли
 * сервисный сбор и как принимаем деньги. Без этого экран оформления
 * гадает — и показывает сбор там, где его нет.
 */
@Public()
@Controller('config')
export class AppConfigController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async read(): Promise<AppConfigResponse> {
    const paymentsMode = this.config.get('PAYMENTS_MODE', { infer: true });
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });

    return {
      paymentsMode,
      serviceFee: paymentsMode === 'online' ? (settings?.serviceFee ?? 0) : 0,
      cancellationGraceMs: CANCELLATION_GRACE_MS,
      cancellationLeadMs: FREE_CANCELLATION_LEAD_MS,
    };
  }
}
