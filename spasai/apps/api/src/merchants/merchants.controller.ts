import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Merchant, UserRole } from '@prisma/client';

import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto, UpdateMerchantDto } from './merchants.dto';
import { MerchantsService } from './merchants.service';

interface MerchantStats {
  ordersToday: number;
  revenueToday: number;
  commissionToday: number;
  ordersTotal: number;
  boxesSavedTotal: number;
  activeBoxes: number;
  ratingAvg: number;
  ratingCount: number;
}

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Заявка на регистрацию заведения — уходит на модерацию. */
  @Post()
  apply(@CurrentUser() user: AuthUser, @Body() dto: CreateMerchantDto): Promise<Merchant> {
    return this.merchants.apply(user.id, dto);
  }

  /** Заведения, которыми владеет текущий пользователь. */
  @Roles(UserRole.merchant, UserRole.admin)
  @Get('me')
  listMine(@CurrentUser() user: AuthUser): Promise<Merchant[]> {
    return this.merchants.listMine(user.id);
  }

  /** Дашборд панели заведения (раздел 5.2 ТЗ). Все суммы — копейки. */
  @Roles(UserRole.merchant, UserRole.admin)
  @Get('me/stats')
  async stats(
    @CurrentUser() user: AuthUser,
    @Query('merchantId') merchantId?: string,
  ): Promise<MerchantStats> {
    const merchant = await this.merchants.requireOwned(user.id, merchantId);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const paidStatuses = ['paid', 'ready', 'collected', 'no_show'] as const;

    const [today, total, collected, activeBoxes] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          merchantId: merchant.id,
          status: { in: [...paidStatuses] },
          paidAt: { gte: startOfDay },
        },
        _sum: { total: true, commissionAmount: true },
        _count: true,
      }),
      this.prisma.order.count({
        where: { merchantId: merchant.id, status: { in: [...paidStatuses] } },
      }),
      this.prisma.order.aggregate({
        where: { merchantId: merchant.id, status: 'collected' },
        _sum: { quantity: true },
      }),
      this.prisma.box.count({ where: { merchantId: merchant.id, status: 'active' } }),
    ]);

    return {
      ordersToday: today._count,
      revenueToday: today._sum.total ?? 0,
      commissionToday: today._sum.commissionAmount ?? 0,
      ordersTotal: total,
      boxesSavedTotal: collected._sum.quantity ?? 0,
      activeBoxes,
      ratingAvg: Number(merchant.ratingAvg),
      ratingCount: merchant.ratingCount,
    };
  }

  @Roles(UserRole.merchant, UserRole.admin)
  @Patch('me/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
  ): Promise<Merchant> {
    return this.merchants.update(user.id, id, dto);
  }

  /** Публичная карточка заведения. */
  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Merchant> {
    return this.merchants.findPublic(id);
  }
}
