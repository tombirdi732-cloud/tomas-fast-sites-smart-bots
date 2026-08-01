import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Merchant, MerchantStatus, OrderStatus, UserRole } from '@prisma/client';

import { Roles } from '../auth/auth.decorators';
import { ApiException } from '../common/errors/api-error';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

class RejectDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

class CommissionDto {
  /** Доля комиссии 0..1. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate!: number;
}

class PlatformSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultCommissionRate?: number;

  /** Сервисный сбор в копейках. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serviceFee?: number;
}

class BlockUserDto {
  @IsBoolean()
  isBlocked!: boolean;
}

class ListMerchantsDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'suspended'])
  status?: MerchantStatus;
}

interface AdminStats {
  /** Оборот платформы (сумма оплаченных заказов), копейки. */
  gmv: number;
  /** Выручка платформы: комиссия + сервисные сборы, копейки. */
  platformRevenue: number;
  orders: number;
  ordersCollected: number;
  ordersNoShow: number;
  users: number;
  merchantsApproved: number;
  merchantsPending: number;
  boxesSaved: number;
  topMerchants: Array<{ id: string; title: string; orders: number; gmv: number }>;
}

/** Админка (раздел 6 ТЗ). Все эндпоинты только для роли admin. */
@Roles(UserRole.admin)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Get('merchants')
  listMerchants(@Query() query: ListMerchantsDto): Promise<Merchant[]> {
    return this.prisma.merchant.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Post('merchants/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: { status: MerchantStatus.approved, rejectionReason: null },
    });
  }

  @Post('merchants/:id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: { status: MerchantStatus.rejected, rejectionReason: dto.reason },
    });
  }

  @Post('merchants/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: { status: MerchantStatus.suspended, rejectionReason: dto.reason },
    });
  }

  /** Индивидуальная комиссия по заведению. */
  @Patch('merchants/:id/commission')
  setCommission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommissionDto,
  ): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: { commissionRate: dto.commissionRate },
    });
  }

  /** Глобальные настройки: комиссия по умолчанию и сервисный сбор. */
  @Get('settings')
  async settings() {
    return this.prisma.platformSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  }

  @Patch('settings')
  updateSettings(@Body() dto: PlatformSettingsDto) {
    return this.prisma.platformSettings.upsert({
      where: { id: 1 },
      update: { ...dto },
      create: { id: 1, ...dto },
    });
  }

  @Get('users')
  listUsers(@Query('search') search?: string) {
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { phone: { contains: search } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        isBlocked: true,
        createdAt: true,
      },
    });
  }

  @Patch('users/:id/block')
  blockUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: { isBlocked: dto.isBlocked },
      select: { id: true, phone: true, isBlocked: true },
    });
  }

  @Get('orders')
  listOrders(@Query('status') status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        merchant: { select: { id: true, title: true } },
        box: { select: { title: true } },
        user: { select: { phone: true } },
      },
    });
  }

  /**
   * Ручной возврат средств. Деньги в ЮKassa возвращаются на этапе 6 —
   * здесь заказ переводится в refunded и количество возвращается в бокс.
   */
  @Post('orders/:id/refund')
  async refund(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw ApiException.notFound('Заказ не найден');

    const refundable: OrderStatus[] = [
      OrderStatus.paid,
      OrderStatus.ready,
      OrderStatus.no_show,
      OrderStatus.collected,
    ];
    if (!refundable.includes(order.status)) {
      throw ApiException.badRequest(
        'ORDER_NOT_REFUNDABLE',
        `Заказ в статусе ${order.status} вернуть нельзя`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.refunded, cancelledAt: new Date() },
    });
  }

  /** Дашборд платформы: GMV, выручка, retention-заготовка, топ заведений. */
  @Get('stats')
  async stats(): Promise<AdminStats> {
    const paidStatuses: OrderStatus[] = [
      OrderStatus.paid,
      OrderStatus.ready,
      OrderStatus.collected,
      OrderStatus.no_show,
    ];

    const [totals, collected, noShow, users, approved, pending, saved, byMerchant] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { status: { in: paidStatuses } },
          _sum: { total: true, commissionAmount: true, serviceFee: true },
          _count: true,
        }),
        this.prisma.order.count({ where: { status: OrderStatus.collected } }),
        this.prisma.order.count({ where: { status: OrderStatus.no_show } }),
        this.prisma.user.count(),
        this.prisma.merchant.count({ where: { status: MerchantStatus.approved } }),
        this.prisma.merchant.count({ where: { status: MerchantStatus.pending } }),
        this.prisma.order.aggregate({
          where: { status: OrderStatus.collected },
          _sum: { quantity: true },
        }),
        this.prisma.order.groupBy({
          by: ['merchantId'],
          where: { status: { in: paidStatuses } },
          _sum: { total: true },
          _count: true,
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
      ]);

    const merchants = await this.prisma.merchant.findMany({
      where: { id: { in: byMerchant.map((row) => row.merchantId) } },
      select: { id: true, title: true },
    });
    const titles = new Map(merchants.map((merchant) => [merchant.id, merchant.title]));

    return {
      gmv: totals._sum.total ?? 0,
      platformRevenue: (totals._sum.commissionAmount ?? 0) + (totals._sum.serviceFee ?? 0),
      orders: totals._count,
      ordersCollected: collected,
      ordersNoShow: noShow,
      users,
      merchantsApproved: approved,
      merchantsPending: pending,
      boxesSaved: saved._sum.quantity ?? 0,
      topMerchants: byMerchant.map((row) => ({
        id: row.merchantId,
        title: titles.get(row.merchantId) ?? '—',
        orders: row._count,
        gmv: row._sum.total ?? 0,
      })),
    };
  }

  /** Ручной запуск фоновых задач — удобно для проверки правил 7.2/7.3/7.6. */
  @Post('maintenance/run')
  async runMaintenance() {
    return {
      releasedUnpaid: await this.orders.releaseUnpaidOrders(),
      noShows: await this.orders.markNoShows(),
    };
  }
}
