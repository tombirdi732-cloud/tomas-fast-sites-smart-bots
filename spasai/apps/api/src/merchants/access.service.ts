import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Merchant, MerchantInvite, MerchantStatus, UserRole } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { MerchantErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';

/** Буквы и цифры без похожих друг на друга: код диктуют по телефону. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_ATTEMPTS = 10;

export type StaffRole = 'owner' | 'staff';

export interface InviteResult {
  code: string;
  expiresAt: string;
  kind: 'merchant' | 'staff';
  note: string | null;
}

/**
 * Кто и как получает доступ к панели заведения.
 *
 * Две двери:
 *   1. Самостоятельная заявка — заведение регистрируется само, попадает
 *      в очередь модерации, продавать не может до одобрения.
 *   2. Код приглашения — вы уже поговорили с рестораном и проверили его,
 *      выписали код; тот, кто пришёл по коду, одобряется сразу.
 *
 * Внутри заведения владелец приглашает кассиров тем же механизмом:
 * выдавать заказы должен уметь каждый, кто стоит за стойкой.
 */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async generateCode(): Promise<string> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
      }

      const existing = await this.prisma.merchantInvite.findUnique({ where: { code } });
      if (!existing) return code;
    }

    throw ApiException.conflict('Не удалось сгенерировать код приглашения');
  }

  /**
   * Приглашение на регистрацию заведения. Выдаёт администратор платформы
   * после того, как договорился с заведением и проверил его.
   */
  async createMerchantInvite(
    adminUserId: string,
    options: { note?: string; expiresInDays?: number },
  ): Promise<InviteResult> {
    const code = await this.generateCode();
    const days = options.expiresInDays ?? 14;

    const invite = await this.prisma.merchantInvite.create({
      data: {
        code,
        merchantId: null,
        note: options.note ?? null,
        createdBy: adminUserId,
        expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000),
      },
    });

    this.logger.log(`Выписано приглашение заведению: ${code}${options.note ? ` (${options.note})` : ''}`);
    return {
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
      kind: 'merchant',
      note: invite.note,
    };
  }

  /** Приглашение сотрудника в конкретное заведение — выдаёт владелец. */
  async createStaffInvite(
    ownerUserId: string,
    merchantId: string,
    options: { note?: string; expiresInDays?: number },
  ): Promise<InviteResult> {
    await this.requireOwner(ownerUserId, merchantId);

    const code = await this.generateCode();
    const days = options.expiresInDays ?? 7;

    const invite = await this.prisma.merchantInvite.create({
      data: {
        code,
        merchantId,
        note: options.note ?? null,
        createdBy: ownerUserId,
        expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000),
      },
    });

    return {
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
      kind: 'staff',
      note: invite.note,
    };
  }

  /** Находит живое приглашение или объясняет, почему оно не годится. */
  async requireValidInvite(code: string): Promise<MerchantInvite> {
    const invite = await this.prisma.merchantInvite.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (!invite) {
      throw ApiException.badRequest('INVITE_NOT_FOUND', 'Код приглашения не найден');
    }
    if (invite.usedAt) {
      throw ApiException.badRequest('INVITE_USED', 'Этот код уже использован');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw ApiException.badRequest('INVITE_EXPIRED', 'Срок действия кода истёк');
    }

    return invite;
  }

  /** Сотрудник входит в заведение по коду от владельца. */
  async joinByInvite(userId: string, code: string): Promise<Merchant> {
    const invite = await this.requireValidInvite(code);

    if (!invite.merchantId) {
      throw ApiException.badRequest(
        'INVITE_FOR_REGISTRATION',
        'Это код для регистрации заведения, а не для входа сотрудника',
      );
    }

    const merchantId = invite.merchantId;

    const merchant = await this.prisma.$transaction(async (tx) => {
      await tx.merchantStaff.upsert({
        where: { merchantId_userId: { merchantId, userId } },
        update: {},
        create: { merchantId, userId, role: 'staff' },
      });

      // Роль нужна, чтобы пройти guard'ы панели.
      await tx.user.update({ where: { id: userId }, data: { role: UserRole.merchant } });

      await tx.merchantInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedByUserId: userId },
      });

      return tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    });

    this.logger.log(`Сотрудник добавлен в «${merchant.title}» по коду ${invite.code}`);
    return merchant;
  }

  /** Помечает приглашение использованным — при регистрации заведения. */
  async consumeInvite(inviteId: string, userId: string, merchantId: string): Promise<void> {
    await this.prisma.merchantInvite.update({
      where: { id: inviteId },
      data: { usedAt: new Date(), usedByUserId: userId, merchantId },
    });
  }

  /** Все заведения, к которым у пользователя есть доступ. */
  async listAccessible(userId: string): Promise<Merchant[]> {
    const staff = await this.prisma.merchantStaff.findMany({
      where: { userId },
      include: { merchant: true },
      orderBy: { createdAt: 'asc' },
    });

    return staff.map((row) => row.merchant);
  }

  /**
   * Доступ к заведению: владелец или сотрудник. Всё, что делает панель,
   * обязано проходить через эту проверку.
   */
  async requireAccess(userId: string, merchantId?: string): Promise<Merchant> {
    const where = merchantId ? { merchantId_userId: { merchantId, userId } } : undefined;

    const membership = where
      ? await this.prisma.merchantStaff.findUnique({ where, include: { merchant: true } })
      : await this.prisma.merchantStaff.findFirst({
          where: { userId },
          include: { merchant: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!membership) {
      throw new ApiException(
        403,
        MerchantErrorCode.NOT_MERCHANT_OWNER,
        'У вас нет доступа к этому заведению',
      );
    }

    return membership.merchant;
  }

  /** Управлять боксами и сотрудниками может только владелец. */
  async requireOwner(userId: string, merchantId: string): Promise<Merchant> {
    const membership = await this.prisma.merchantStaff.findUnique({
      where: { merchantId_userId: { merchantId, userId } },
      include: { merchant: true },
    });

    if (!membership || membership.role !== 'owner') {
      throw new ApiException(
        403,
        MerchantErrorCode.NOT_MERCHANT_OWNER,
        'Это действие доступно только владельцу заведения',
      );
    }

    return membership.merchant;
  }

  /** Сотрудники заведения — для экрана управления доступом. */
  listStaff(merchantId: string) {
    return this.prisma.merchantStaff.findMany({
      where: { merchantId },
      include: { user: { select: { id: true, phone: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Убрать сотрудника. Владельца убрать нельзя — заведение осталось бы без хозяина. */
  async removeStaff(ownerUserId: string, merchantId: string, userId: string): Promise<void> {
    await this.requireOwner(ownerUserId, merchantId);

    const membership = await this.prisma.merchantStaff.findUnique({
      where: { merchantId_userId: { merchantId, userId } },
    });

    if (!membership) throw ApiException.notFound('Сотрудник не найден');
    if (membership.role === 'owner') {
      throw ApiException.badRequest('CANNOT_REMOVE_OWNER', 'Владельца нельзя убрать из заведения');
    }

    await this.prisma.merchantStaff.delete({ where: { id: membership.id } });
  }

  /** Проверка, одобрено ли заведение — продавать может только approved. */
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
}
