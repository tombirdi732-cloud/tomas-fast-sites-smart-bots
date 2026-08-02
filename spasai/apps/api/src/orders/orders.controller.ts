import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order, UserRole } from '@prisma/client';

import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiException } from '../common/errors/api-error';
import type { Env } from '../config/env';
import { MerchantsService } from '../merchants/merchants.service';
import { YookassaService } from '../payments/yookassa.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectOrderDto, CreateOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

interface CreateOrderResponse {
  order: Order;
  /**
   * Ссылка на оплату в ЮKassa. null в режиме on_pickup (покупатель платит
   * на месте) и в dev без ключей магазина.
   */
  paymentUrl: string | null;
  /** on_pickup — бронь без предоплаты, online — оплата в приложении. */
  paymentsMode: 'on_pickup' | 'online';
}

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService<Env, true>,
    private readonly yookassa: YookassaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Создание заказа: количество резервируется сразу, транзакционно,
   * затем создаётся платёж в ЮKassa с фискальным чеком.
   */
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ): Promise<CreateOrderResponse> {
    const mode = this.config.get('PAYMENTS_MODE', { infer: true });
    const order = await this.orders.create(user.id, dto.boxId, dto.quantity);

    // Бронь без предоплаты: код выдачи сразу, деньги — на месте.
    if (mode === 'on_pickup') {
      return {
        order: await this.orders.reserveWithoutPayment(order.id),
        paymentUrl: null,
        paymentsMode: mode,
      };
    }

    if (!this.yookassa.enabled) {
      return { order, paymentUrl: null, paymentsMode: mode };
    }

    const box = await this.prisma.box.findUniqueOrThrow({
      where: { id: order.boxId },
      select: { title: true },
    });

    const payment = await this.yookassa.createPayment(order, {
      boxTitle: box.title,
      customerPhone: user.phone,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payment.paymentId },
    });

    return { order, paymentUrl: payment.confirmationUrl, paymentsMode: mode };
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('active') active?: string): Promise<Order[]> {
    return this.orders.listMine(user.id, active === 'true');
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Order> {
    return this.orders.findOwn(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.orders.cancelByCustomer(user.id, id);
  }

  /**
   * Dev-заглушка оплаты: до подключения ЮKassa (этап 6) позволяет
   * пройти сценарий целиком. В production эндпоинт недоступен.
   */
  @Post(':id/pay-dev')
  @HttpCode(HttpStatus.OK)
  async payDev(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Order> {
    if (this.config.get('SMS_PROVIDER', { infer: true }) !== 'stub') {
      throw ApiException.notFound('Эндпоинт доступен только в dev-режиме');
    }
    await this.orders.findOwn(user.id, id);
    return this.orders.markPaid(id, `dev-${id}`);
  }
}

/** Заказы в панели заведения. */
@Roles(UserRole.merchant, UserRole.admin)
@Controller('merchants/me/orders')
export class MerchantOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly merchants: MerchantsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('merchantId') merchantId?: string,
    @Query('pending') pending?: string,
  ): Promise<Order[]> {
    const merchant = await this.merchants.requireOwned(user.id, merchantId);
    return this.orders.listForMerchant(merchant.id, pending === 'true');
  }

  /** Подтверждение выдачи по коду покупателя (раздел 5.5 ТЗ). */
  @Post('collect')
  @HttpCode(HttpStatus.OK)
  async collect(
    @CurrentUser() user: AuthUser,
    @Body() dto: CollectOrderDto,
    @Query('merchantId') merchantId?: string,
  ): Promise<Order> {
    const merchant = await this.merchants.requireOwned(user.id, merchantId);
    return this.orders.collectByCode(merchant.id, dto.pickupCode);
  }
}
