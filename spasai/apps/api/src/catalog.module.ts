import { Module } from '@nestjs/common';

import { AdminController } from './admin/admin.controller';
import { BoxesController, MerchantBoxesController } from './boxes/boxes.controller';
import { BoxesService } from './boxes/boxes.service';
import { MerchantsController } from './merchants/merchants.controller';
import { MerchantsService } from './merchants/merchants.service';
import { MerchantOrdersController, OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
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
  ],
  providers: [MerchantsService, BoxesService, OrdersService, SchedulerService],
  exports: [MerchantsService, BoxesService, OrdersService],
})
export class CatalogModule {}
