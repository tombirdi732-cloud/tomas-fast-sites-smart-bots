import { Module } from '@nestjs/common';

import { AdminController } from './admin/admin.controller';
import { BoxesController, MerchantBoxesController } from './boxes/boxes.controller';
import { BoxesService } from './boxes/boxes.service';
import { MerchantsController } from './merchants/merchants.controller';
import {
  AdminInvitesController,
  MerchantJoinController,
  MerchantStaffController,
} from './merchants/access.controller';
import { AccessService } from './merchants/access.service';
import { AddressService } from './merchants/address.service';
import { InnCheckService } from './merchants/inn-check.service';
import { MerchantsService } from './merchants/merchants.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { MerchantOrdersController, OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { PaymentsController } from './payments/payments.controller';
import { YookassaService } from './payments/yookassa.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { FavoritesController, ReviewsController } from './social/social.controller';

/**
 * Ядро продукта (этап 3 ТЗ): заведения, боксы с геопоиском, заказы
 * с транзакционным резервированием, отзывы и избранное.
 */
@Module({
  controllers: [
    MerchantsController,
    BoxesController,
    MerchantBoxesController,
    OrdersController,
    MerchantOrdersController,
    ReviewsController,
    FavoritesController,
    AdminController,
    PaymentsController,
    NotificationsController,
    AdminInvitesController,
    MerchantStaffController,
    MerchantJoinController,
  ],
  providers: [
    MerchantsService,
    InnCheckService,
    AccessService,
    AddressService,
    BoxesService,
    OrdersService,
    YookassaService,
    NotificationsService,
    SchedulerService,
  ],
  exports: [
    MerchantsService,
    AccessService,
    BoxesService,
    OrdersService,
    YookassaService,
    NotificationsService,
  ],
})
export class CatalogModule {}
