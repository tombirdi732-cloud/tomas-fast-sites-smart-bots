import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BoxesService } from '../boxes/boxes.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';

/** Фоновые задачи из раздела 7 ТЗ: состояние заказов, боксов и напоминания. */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly boxes: BoxesService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Каждые 5 минут (7.3): боксы с истёкшим окном выдачи → expired.
   * Заодно (7.6) заказы, которые не забрали, → no_show.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'expire-boxes' })
  async expireBoxes(): Promise<void> {
    const expired = await this.boxes.expireStaleBoxes();
    const noShows = await this.orders.markNoShows();

    if (expired > 0 || noShows > 0) {
      this.logger.log(`Истекло боксов: ${expired}, не забрано заказов: ${noShows}`);
    }
  }

  /** Каждую минуту (7.2): снять бронь с заказов, не оплаченных за 10 минут. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'release-unpaid' })
  async releaseUnpaid(): Promise<void> {
    await this.orders.releaseUnpaidOrders();
  }

  /** Каждые 10 минут (7.9): напомнить о заказе за час до конца окна выдачи. */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'pickup-reminders' })
  async pickupReminders(): Promise<void> {
    await this.notifications.remindAboutPickup();
  }
}
