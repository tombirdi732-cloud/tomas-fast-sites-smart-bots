import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Favorite, OrderStatus, Review, UserRole } from '@prisma/client';

import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { ApiException } from '../common/errors/api-error';
import { MerchantsService } from '../merchants/merchants.service';
import { CreateReviewDto, ReplyReviewDto } from '../orders/orders.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  /** Отзыв можно оставить только по полученному заказу и только один раз. */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto): Promise<Review> {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId: user.id },
    });

    if (!order) throw ApiException.notFound('Заказ не найден');

    if (order.status !== OrderStatus.collected) {
      throw ApiException.badRequest(
        'REVIEW_NOT_ALLOWED',
        'Отзыв можно оставить только после получения заказа',
      );
    }

    const existing = await this.prisma.review.findUnique({ where: { orderId: order.id } });
    if (existing) {
      throw ApiException.conflict('Отзыв по этому заказу уже оставлен');
    }

    const review = await this.prisma.review.create({
      data: {
        orderId: order.id,
        userId: user.id,
        merchantId: order.merchantId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      },
    });

    await this.merchants.recalculateRating(order.merchantId);
    return review;
  }

  /** Отзывы заведения для карточки в приложении. */
  @Public()
  @Get()
  list(
    @Query('merchantId', ParseUUIDPipe) merchantId: string,
    @Query('limit') limit?: string,
  ): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 20, 100),
    });
  }

  /** Ответ заведения на отзыв (раздел 5.7 ТЗ). */
  @Roles(UserRole.merchant, UserRole.admin)
  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  async reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyReviewDto,
  ): Promise<Review> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw ApiException.notFound('Отзыв не найден');

    await this.merchants.requireOwned(user.id, review.merchantId);
    return this.prisma.review.update({ where: { id }, data: { reply: dto.reply } });
  }
}

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Favorite[]> {
    return this.prisma.favorite.findMany({
      where: { userId: user.id },
      include: { merchant: { select: { id: true, title: true, address: true, logoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body('merchantId', ParseUUIDPipe) merchantId: string,
  ): Promise<Favorite> {
    return this.prisma.favorite.upsert({
      where: { userId_merchantId: { userId: user.id, merchantId } },
      update: {},
      create: { userId: user.id, merchantId },
    });
  }

  @Delete(':merchantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
  ): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId: user.id, merchantId } });
  }
}
