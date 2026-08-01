import { Injectable, Logger } from '@nestjs/common';
import { Merchant, MerchantStatus, UserRole } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { MerchantErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto, UpdateMerchantDto } from './merchants.dto';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Заявка на регистрацию заведения. Создаётся в статусе pending —
   * до одобрения администратором продавать нельзя (раздел 6 ТЗ).
   */
  async apply(userId: string, dto: CreateMerchantDto): Promise<Merchant> {
    const existing = await this.prisma.merchant.findUnique({ where: { inn: dto.inn } });
    if (existing) {
      throw new ApiException(
        409,
        MerchantErrorCode.MERCHANT_ALREADY_EXISTS,
        'Заведение с таким ИНН уже зарегистрировано',
      );
    }

    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });

    const merchant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.merchant.create({
        data: {
          ownerUserId: userId,
          title: dto.title,
          description: dto.description ?? null,
          category: dto.category,
          address: dto.address,
          lat: dto.lat,
          lng: dto.lng,
          phone: dto.phone,
          inn: dto.inn,
          legalName: dto.legalName,
          timezone: dto.timezone ?? 'Europe/Moscow',
          logoUrl: dto.logoUrl ?? null,
          photos: dto.photos ?? [],
          commissionRate: settings?.defaultCommissionRate ?? 0.2,
          status: MerchantStatus.pending,
        },
      });

      // Владелец заведения получает роль merchant, чтобы попасть в панель.
      await tx.user.update({
        where: { id: userId },
        data: { role: UserRole.merchant },
      });

      return created;
    });

    this.logger.log(`Заявка на заведение: ${merchant.title} (ИНН ${merchant.inn})`);
    return merchant;
  }

  /** Публичная карточка заведения. Неодобренные наружу не отдаём. */
  async findPublic(id: string): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findFirst({
      where: { id, status: MerchantStatus.approved },
    });
    if (!merchant) {
      throw ApiException.notFound('Заведение не найдено');
    }
    return merchant;
  }

  /** Заведения текущего пользователя (владелец может иметь несколько точек). */
  listMine(userId: string): Promise<Merchant[]> {
    return this.prisma.merchant.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Заведение, от имени которого работает пользователь.
   * Все эндпоинты /merchants/me/* обязаны проходить через эту проверку.
   */
  async requireOwned(userId: string, merchantId?: string): Promise<Merchant> {
    const merchant = merchantId
      ? await this.prisma.merchant.findUnique({ where: { id: merchantId } })
      : await this.prisma.merchant.findFirst({
          where: { ownerUserId: userId },
          orderBy: { createdAt: 'asc' },
        });

    if (!merchant) {
      throw ApiException.notFound('Заведение не найдено');
    }

    if (merchant.ownerUserId !== userId) {
      throw new ApiException(
        403,
        MerchantErrorCode.NOT_MERCHANT_OWNER,
        'Это заведение принадлежит другому пользователю',
      );
    }

    return merchant;
  }

  /** Продавать может только одобренное заведение. */
  static assertApproved(merchant: Merchant): void {
    if (merchant.status !== MerchantStatus.approved) {
      throw new ApiException(
        403,
        MerchantErrorCode.MERCHANT_NOT_APPROVED,
        `Заведение не прошло модерацию (статус: ${merchant.status})`,
        merchant.rejectionReason ? { reason: merchant.rejectionReason } : undefined,
      );
    }
  }

  async update(userId: string, merchantId: string, dto: UpdateMerchantDto): Promise<Merchant> {
    await this.requireOwned(userId, merchantId);
    return this.prisma.merchant.update({ where: { id: merchantId }, data: { ...dto } });
  }

  /** Пересчёт рейтинга после нового отзыва. */
  async recalculateRating(merchantId: string): Promise<void> {
    const stats = await this.prisma.review.aggregate({
      where: { merchantId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ratingAvg: stats._avg.rating ?? 0,
        ratingCount: stats._count.rating,
      },
    });
  }
}
