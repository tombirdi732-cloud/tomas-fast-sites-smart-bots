import { createSign } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, OrderStatus } from '@prisma/client';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface PushPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Уведомления (раздел 7.9 ТЗ).
 *
 * Каждое уведомление сохраняется в БД — это источник правды для экрана
 * уведомлений. Отправка в FCM выполняется поверх и не обязана удаваться:
 * без ключей сервисного аккаунта пуши просто не уходят.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get enabled(): boolean {
    return (
      this.config.get('FCM_PROJECT_ID', { infer: true }).length > 0 &&
      this.config.get('FCM_CLIENT_EMAIL', { infer: true }).length > 0 &&
      this.config.get('FCM_PRIVATE_KEY', { infer: true }).length > 0
    );
  }

  /** Сохранить уведомление и попытаться отправить пуш. */
  async notify(payload: PushPayload): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        payloadJson: payload.data ?? {},
      },
    });

    if (!this.enabled) return;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { fcmToken: true },
    });

    if (!user?.fcmToken) return;

    try {
      await this.send(user.fcmToken, payload);
    } catch (error) {
      this.logger.warn(
        `Пуш пользователю ${payload.userId} не доставлен: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** OAuth-токен для FCM HTTP v1, подписанный сервисным аккаунтом. */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }

    const clientEmail = this.config.get('FCM_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FCM_PRIVATE_KEY', { infer: true }).replace(/\\n/g, '\n');

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: clientEmail,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };

    const encode = (value: object): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    const unsigned = `${encode(header)}.${encode(claims)}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`FCM OAuth ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  private async send(fcmToken: string, payload: PushPayload): Promise<void> {
    const projectId = this.config.get('FCM_PROJECT_ID', { infer: true });
    const accessToken = await this.getAccessToken();

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title: payload.title, body: payload.body },
            data: payload.data ?? {},
            android: { priority: 'high' },
          },
        }),
      },
    );

    if (!response.ok) {
      // Токен протух — чистим, чтобы не долбиться в него каждый раз.
      if (response.status === 404 || response.status === 400) {
        await this.prisma.user.updateMany({
          where: { fcmToken },
          data: { fcmToken: null },
        });
      }
      throw new Error(`FCM ${response.status}`);
    }
  }

  /**
   * Напоминание за час до конца окна выдачи, если заказ не забран (7.9).
   * Повторно не шлём: проверяем, что такого уведомления ещё не было.
   */
  async remindAboutPickup(): Promise<number> {
    const now = Date.now();
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.paid, OrderStatus.ready] },
        box: {
          pickupEnd: {
            gt: new Date(now),
            lte: new Date(now + 60 * 60 * 1000),
          },
        },
      },
      include: {
        box: { select: { title: true, pickupEnd: true } },
        merchant: { select: { title: true, address: true } },
      },
    });

    let sent = 0;
    for (const order of orders) {
      const already = await this.prisma.notification.findFirst({
        where: {
          userId: order.userId,
          type: NotificationType.pickup_reminder,
          payloadJson: { path: ['orderId'], equals: order.id },
        },
      });
      if (already) continue;

      await this.notify({
        userId: order.userId,
        type: NotificationType.pickup_reminder,
        title: 'Заберите заказ',
        body: `«${order.merchant.title}» на ${order.merchant.address} закрывается через час. Код ${order.pickupCode ?? ''}`,
        data: { orderId: order.id, type: 'pickup_reminder' },
      });
      sent += 1;
    }

    if (sent > 0) this.logger.log(`Напоминаний о выдаче: ${sent}`);
    return sent;
  }

  /**
   * «В вашем избранном заведении появился бокс» (7.9).
   * Вызывается при создании бокса.
   */
  async notifyFavoritesAboutBox(merchantId: string, boxId: string, boxTitle: string): Promise<number> {
    const [merchant, favorites] = await Promise.all([
      this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { title: true } }),
      this.prisma.favorite.findMany({ where: { merchantId }, select: { userId: true } }),
    ]);

    if (!merchant) return 0;

    for (const favorite of favorites) {
      await this.notify({
        userId: favorite.userId,
        type: NotificationType.favorite_new_box,
        title: merchant.title,
        body: `Появился бокс «${boxTitle}»`,
        data: { boxId, type: 'favorite_new_box' },
      });
    }

    if (favorites.length > 0) {
      this.logger.log(`Оповещено об избранном: ${favorites.length}`);
    }
    return favorites.length;
  }
}
