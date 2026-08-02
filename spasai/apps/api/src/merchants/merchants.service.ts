import { Injectable, Logger } from '@nestjs/common';
import { Merchant, MerchantStatus, Prisma, UserRole } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { MerchantErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { InnCheckService } from './inn-check.service';
import { CreateMerchantDto, UpdateMerchantDto } from './merchants.dto';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly innCheck: InnCheckService,
    private readonly access: AccessService,
  ) {}

  /**
   * Заявка на регистрацию заведения. Создаётся в статусе pending —
   * до одобрения администратором продавать нельзя (раздел 6 ТЗ).
   */
  async apply(userId: string, dto: CreateMerchantDto): Promise<Merchant> {
    // Пришёл по коду — значит, вы уже проверили заведение лично.
    const invite = dto.inviteCode ? await this.access.requireValidInvite(dto.inviteCode) : null;
    if (invite?.merchantId) {
      throw ApiException.badRequest(
        'INVITE_FOR_STAFF',
        'Это код для входа сотрудника, а не для регистрации заведения',
      );
    }

    const existing = await this.prisma.merchant.findUnique({ where: { inn: dto.inn } });
    if (existing) {
      throw new ApiException(
        409,
        MerchantErrorCode.MERCHANT_ALREADY_EXISTS,
        'Заведение с таким ИНН уже зарегистрировано',
      );
    }

    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });

    // Сверяем ИНН с реестром заранее — модератор увидит расхождения сразу.
    const verification = await this.innCheck.check(dto.inn, dto.legalName);

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
          status: invite ? MerchantStatus.approved : MerchantStatus.pending,
          // Prisma принимает произвольный JSON — структура InnCheck плоская и сериализуемая.
          verification: verification as unknown as Prisma.InputJsonValue,
        },
      });

      // Владелец получает доступ к панели и роль merchant.
      await tx.merchantStaff.create({
        data: { merchantId: created.id, userId, role: 'owner' },
      });
      await tx.user.update({
        where: { id: userId },
        data: { role: UserRole.merchant },
      });

      return created;
    });

    if (invite) {
      await this.access.consumeInvite(invite.id, userId, merchant.id);
    }

    this.logger.log(
      `${invite ? 'Заведение по приглашению' : 'Заявка на заведение'}: ` +
        `${merchant.title} (ИНН ${merchant.inn})` +
        (verification.checked
          ? ` · реестр: ${verification.found ? verification.status ?? 'найдена' : 'не найдена'}`
          : ' · автопроверка выключена'),
    );
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

  /** Заведения, к которым у пользователя есть доступ: свои и те, где он кассир. */
  listMine(userId: string): Promise<Merchant[]> {
    return this.access.listAccessible(userId);
  }

  /**
   * Заведение, от имени которого работает пользователь.
   * Все эндпоинты /merchants/me/* обязаны проходить через эту проверку.
   */
  requireOwned(userId: string, merchantId?: string): Promise<Merchant> {
    return this.access.requireAccess(userId, merchantId);
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
    // Менять карточку заведения может только владелец, не кассир.
    await this.access.requireOwner(userId, merchantId);
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
