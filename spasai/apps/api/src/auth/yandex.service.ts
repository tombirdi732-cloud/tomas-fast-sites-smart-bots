import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../common/errors/api-error';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Сколько живёт начатый вход: успеть подтвердить на стороне Яндекса. */
const LOGIN_TTL_SEC = 600;

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const INFO_URL = 'https://login.yandex.ru/info';

export interface YandexLoginStart {
  /** Одноразовый код, по нему приложение потом забирает токены. */
  state: string;
  /** Ссылка, которую открывает приложение. */
  url: string;
  expiresIn: number;
}

export interface ConfirmedLogin {
  externalId: string;
  displayName: string | null;
  email: string | null;
}

interface YandexTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface YandexUserInfo {
  id?: string;
  login?: string;
  real_name?: string;
  first_name?: string;
  default_email?: string;
}

/**
 * Вход через Яндекс ID.
 *
 * Выбран вместо Telegram по простой причине: с российского хостинга
 * `api.telegram.org` недоступен, и обратно вебхук тоже не доставляется.
 * Яндекс — российский сервис, до него сервер дотягивается напрямую.
 *
 * Схема обычная для OAuth, но подтверждение приложение не ловит само:
 * Яндекс возвращает пользователя на наш `/auth/yandex/callback`, сервер
 * там же обменивает код на данные и помечает вход подтверждённым,
 * а приложение узнаёт об этом, опрашивая `claim()`. Так один и тот же
 * код работает и в мобильном приложении, и в панели.
 */
@Injectable()
export class YandexService {
  private readonly logger = new Logger(YandexService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  private get clientId(): string {
    return this.config.get('YANDEX_CLIENT_ID', { infer: true });
  }

  private get clientSecret(): string {
    return this.config.get('YANDEX_CLIENT_SECRET', { infer: true });
  }

  get enabled(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  /** Куда Яндекс возвращает пользователя. Должен совпадать с кабинетом. */
  get redirectUri(): string {
    const base = this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/auth/yandex/callback`;
  }

  /** Шаг 1: ссылка на страницу подтверждения Яндекса. */
  async start(): Promise<YandexLoginStart> {
    if (!this.enabled) {
      throw ApiException.badRequest(
        'YANDEX_LOGIN_DISABLED',
        'Вход через Яндекс не настроен на сервере',
      );
    }

    const state = randomBytes(16).toString('base64url');

    await this.prisma.externalLogin.create({
      data: {
        provider: 'yandex',
        state,
        expiresAt: new Date(Date.now() + LOGIN_TTL_SEC * 1000),
      },
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      // Пусть Яндекс каждый раз спрашивает: иначе на общем устройстве
      // следующий человек молча войдёт под предыдущим.
      force_confirm: 'yes',
    });

    return { state, url: `${AUTHORIZE_URL}?${params.toString()}`, expiresIn: LOGIN_TTL_SEC };
  }

  /**
   * Шаг 2: Яндекс вернул пользователя с кодом. Меняем код на данные
   * и помечаем вход подтверждённым. Возвращает true, если всё сошлось.
   */
  async completeCallback(code: string, state: string): Promise<boolean> {
    const login = await this.prisma.externalLogin.findUnique({ where: { state } });

    if (!login || login.provider !== 'yandex' || login.usedAt || login.confirmedAt) return false;
    if (login.expiresAt.getTime() < Date.now()) return false;

    const token = await this.exchangeCode(code);
    if (!token) return false;

    const info = await this.fetchUser(token);
    if (!info?.id) return false;

    await this.prisma.externalLogin.update({
      where: { id: login.id },
      data: {
        externalId: info.id,
        login: info.login ?? null,
        displayName: info.real_name || info.first_name || info.login || null,
        email: info.default_email ?? null,
        confirmedAt: new Date(),
      },
    });

    return true;
  }

  private async exchangeCode(code: string): Promise<string | null> {
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
      });

      const payload = (await response.json()) as YandexTokenResponse;
      if (!payload.access_token) {
        this.logger.warn(
          `Яндекс не отдал токен: ${payload.error_description ?? payload.error ?? 'без причины'}`,
        );
        return null;
      }
      return payload.access_token;
    } catch (error) {
      this.logger.error(
        `Не удалось обменять код Яндекса: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async fetchUser(accessToken: string): Promise<YandexUserInfo | null> {
    try {
      const response = await fetch(`${INFO_URL}?format=json`, {
        headers: { Authorization: `OAuth ${accessToken}` },
      });
      if (!response.ok) {
        this.logger.warn(`Яндекс не отдал профиль: ${response.status}`);
        return null;
      }
      return (await response.json()) as YandexUserInfo;
    } catch (error) {
      this.logger.error(
        `Не удалось прочитать профиль Яндекса: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** Шаг 3: приложение спрашивает, подтверждён ли вход. */
  async claim(state: string): Promise<ConfirmedLogin | null> {
    const login = await this.prisma.externalLogin.findUnique({ where: { state } });

    if (!login || login.provider !== 'yandex') {
      throw ApiException.badRequest('YANDEX_LOGIN_UNKNOWN', 'Вход не найден, начните заново');
    }
    if (login.usedAt) {
      throw ApiException.badRequest('YANDEX_LOGIN_USED', 'Этот вход уже использован');
    }
    if (login.expiresAt.getTime() < Date.now()) {
      throw ApiException.badRequest('YANDEX_LOGIN_EXPIRED', 'Время на вход истекло, начните заново');
    }
    if (!login.confirmedAt || !login.externalId) return null;

    // Помечаем использованным сразу: пара токенов выдаётся ровно один раз.
    await this.prisma.externalLogin.update({
      where: { id: login.id },
      data: { usedAt: new Date() },
    });

    return {
      externalId: login.externalId,
      displayName: login.displayName,
      email: login.email,
    };
  }
}
