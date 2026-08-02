import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { AuthErrorCode } from '../common/errors/error-codes';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';

export interface JwtPayload {
  /** id пользователя */
  sub: string;
  role: UserRole;
  /** У пришедших из Telegram телефона нет. */
  phone: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestCodeResult {
  /** Через сколько секунд можно запросить код повторно. */
  retryAfter: number;
  /** В dev-режиме код возвращается прямо в ответе, чтобы не искать его в логах. */
  devCode?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** HMAC вместо голого хэша: по утечке БД коды и токены не восстановить. */
  private hash(value: string): string {
    return createHmac('sha256', this.config.get('AUTH_HASH_SECRET', { infer: true }))
      .update(value)
      .digest('hex');
  }

  private static safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  }

  /**
   * Шаг 1: выслать код. Rate limit — не чаще одного кода в минуту на номер
   * (раздел 10 ТЗ), считается по времени последней отправки в БД.
   */
  async requestCode(phone: string): Promise<RequestCodeResult> {
    const cooldown = this.config.get('SMS_RESEND_COOLDOWN', { infer: true });
    const ttl = this.config.get('SMS_CODE_TTL', { infer: true });

    const last = await this.prisma.phoneVerification.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });

    if (last) {
      const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsed < cooldown) {
        const retryAfter = Math.ceil(cooldown - elapsed);
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          AuthErrorCode.SMS_RATE_LIMITED,
          `Код уже отправлен. Повторите через ${retryAfter} с.`,
          { retryAfter },
        );
      }
    }

    const code = this.sms.generateCode();

    const verification = await this.prisma.phoneVerification.create({
      data: {
        phone,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });

    try {
      await this.sms.send(phone, code);
    } catch (error) {
      // Провайдер отказал — снимаем запись, иначе минутный кулдаун съеден
      // впустую и пользователь заперт без единого шанса повторить.
      await this.prisma.phoneVerification.delete({ where: { id: verification.id } });

      this.logger.error(
        `Не удалось отправить код: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        AuthErrorCode.SMS_SEND_FAILED,
        'Не удалось отправить SMS. Попробуйте ещё раз через минуту.',
      );
    }

    return { retryAfter: cooldown, ...(this.sms.isStub ? { devCode: code } : {}) };
  }

  /**
   * Шаг 2: проверить код и выдать пару токенов.
   * Пользователь создаётся при первом успешном входе.
   */
  async verifyCode(phone: string, code: string, name?: string): Promise<TokenPair & { user: User }> {
    const maxAttempts = this.config.get('SMS_MAX_ATTEMPTS', { infer: true });

    const verification = await this.prisma.phoneVerification.findFirst({
      where: { phone, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      throw ApiException.badRequest(AuthErrorCode.CODE_INVALID, 'Код не запрашивался или уже использован');
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      throw ApiException.badRequest(AuthErrorCode.CODE_EXPIRED, 'Срок действия кода истёк, запросите новый');
    }

    if (verification.attempts >= maxAttempts) {
      throw ApiException.badRequest(
        AuthErrorCode.CODE_ATTEMPTS_EXCEEDED,
        'Слишком много попыток, запросите новый код',
      );
    }

    if (!AuthService.safeEqualHex(verification.codeHash, this.hash(code))) {
      await this.prisma.phoneVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw ApiException.badRequest(AuthErrorCode.CODE_INVALID, 'Неверный код', {
        attemptsLeft: Math.max(0, maxAttempts - verification.attempts - 1),
      });
    }

    await this.prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: name ? { name } : {},
      create: { phone, name: name ?? null, role: UserRole.customer },
    });

    if (user.isBlocked) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.USER_BLOCKED,
        'Аккаунт заблокирован',
      );
    }

    const tokens = await this.issueTokens(user);
    this.logger.log(`Вход выполнен: ${phone} (${user.role})`);
    return { ...tokens, user };
  }

  /**
   * Демо-вход: аккаунт без номера и кода, чтобы показать приложение,
   * пока не подключена рассылка SMS.
   *
   * Намеренно не трогает обычный вход. Номер выдаёт сервер из служебного
   * диапазона, поэтому попасть этим ходом в чужой аккаунт нельзя — можно
   * только завести себе пустой. Включается флагом `DEMO_LOGIN`, в боевом
   * режиме его положено выключить, как только заработают SMS.
   */
  async demoLogin(): Promise<TokenPair & { user: User }> {
    if (!this.config.get('DEMO_LOGIN', { infer: true })) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.DEMO_LOGIN_DISABLED,
        'Демо-вход выключен. Войдите по номеру телефона.',
      );
    }

    // Служебный диапазон: настоящие номера сюда не попадают, потому что
    // обычный вход требует код из SMS, а его на такой номер никто не шлёт.
    const phone = `+7900${randomInt(1_000_000, 10_000_000)}`;

    // Имя не подставляем: пользователь задаст его сам в профиле, и нигде
    // не будет торчать слово «демо».
    const user = await this.prisma.user.create({
      data: { phone, role: UserRole.customer },
    });

    const tokens = await this.issueTokens(user);
    this.logger.log(`Демо-вход: заведён аккаунт ${phone}`);
    return { ...tokens, user };
  }

  /**
   * Вход по подтверждённому Telegram: находим пользователя по его id
   * или заводим нового. Телефона у такого аккаунта нет — и не нужен.
   */
  async loginByTelegram(
    telegramId: string,
    firstName: string | null,
  ): Promise<TokenPair & { user: User }> {
    const user = await this.prisma.user.upsert({
      where: { telegramId },
      // Имя не перезаписываем: пользователь мог задать своё в профиле.
      update: {},
      create: { telegramId, name: firstName, role: UserRole.customer },
    });

    if (user.isBlocked) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.USER_BLOCKED,
        'Аккаунт заблокирован',
      );
    }

    const tokens = await this.issueTokens(user);
    this.logger.log(`Вход через Telegram: ${telegramId} (${user.role})`);
    return { ...tokens, user };
  }

  /** Обновление пары с ротацией: старый refresh отзывается. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt !== null || stored.expiresAt.getTime() < Date.now()) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        AuthErrorCode.REFRESH_INVALID,
        'Refresh-токен недействителен или истёк',
      );
    }

    if (stored.user.isBlocked) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.USER_BLOCKED,
        'Аккаунт заблокирован',
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user);
  }

  /** Выход: отзываем конкретный refresh-токен. */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });

    const payload: JwtPayload = { sub: user.id, role: user.role, phone: user.phone };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: accessTtl });

    // Refresh — непредсказуемая строка, а не JWT: её можно отозвать в БД.
    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }
}
