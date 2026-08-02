import { randomBytes } from 'node:crypto';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../common/errors/api-error';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Сколько живёт начатый вход: успеть открыть бота и нажать «Старт». */
const LOGIN_TTL_SEC = 300;

const API = 'https://api.telegram.org';

export interface TelegramLoginStart {
  /** Одноразовый код, по нему приложение потом забирает токены. */
  nonce: string;
  /** Ссылка, которую открывает приложение. */
  url: string;
  expiresIn: number;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number; username?: string; first_name?: string; is_bot?: boolean };
  };
}

/**
 * Вход через Telegram — бесплатная замена SMS.
 *
 * Как это работает:
 *   1. Приложение просит `start()` — сервер выдаёт одноразовый nonce
 *      и ссылку `t.me/<бот>?start=<nonce>`.
 *   2. Пользователь открывает бота и жмёт «Старт». Telegram присылает
 *      вебхуком сообщение `/start <nonce>` — так сервер узнаёт, кто это.
 *   3. Приложение опрашивает `poll()` и получает токены.
 *
 * Ни номера телефона, ни кода: nonce одноразовый, живёт пять минут
 * и обменивается на токены ровно один раз.
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  private get token(): string {
    return this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
  }

  private get username(): string {
    return this.config.get('TELEGRAM_BOT_USERNAME', { infer: true }).replace(/^@/, '');
  }

  get enabled(): boolean {
    return this.token.length > 0 && this.username.length > 0;
  }

  /**
   * Секрет, которым Telegram подписывает вебхук. Выводим из токена бота,
   * чтобы не заводить ещё одну переменную окружения: посторонний его
   * не подберёт, не зная токена.
   */
  get webhookSecret(): string {
    return this.token ? Buffer.from(this.token).toString('base64url').slice(0, 40) : '';
  }

  /** Прописываем адрес вебхука при старте — иначе бот молчит. */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Вход через Telegram выключен: не задан TELEGRAM_BOT_TOKEN');
      return;
    }

    const base = this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '');
    if (!base.startsWith('https://')) {
      this.logger.warn(
        'PUBLIC_API_URL не задан или без https — вебхук Telegram не зарегистрирован. ' +
          'Вход через Telegram работать не будет.',
      );
      return;
    }

    try {
      await this.call('setWebhook', {
        url: `${base}/webhooks/telegram`,
        secret_token: this.webhookSecret,
        allowed_updates: ['message'],
      });
      this.logger.log(`Вебхук Telegram зарегистрирован на ${base}/webhooks/telegram`);
    } catch (error) {
      this.logger.error(
        `Не удалось зарегистрировать вебхук Telegram: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async call(method: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { ok?: boolean; description?: string };
    // Telegram отвечает 200 даже на отказ — смотреть надо на поле ok.
    if (!payload.ok) {
      throw new Error(payload.description ?? `Telegram отклонил ${method}`);
    }
    return payload;
  }

  /** Шаг 1: выдать ссылку на бота. */
  async start(): Promise<TelegramLoginStart> {
    if (!this.enabled) {
      throw ApiException.badRequest(
        'TELEGRAM_LOGIN_DISABLED',
        'Вход через Telegram не настроен на сервере',
      );
    }

    const nonce = randomBytes(16).toString('base64url');

    await this.prisma.externalLogin.create({
      data: {
        provider: 'telegram',
        state: nonce,
        expiresAt: new Date(Date.now() + LOGIN_TTL_SEC * 1000),
      },
    });

    return {
      nonce,
      url: `https://t.me/${this.username}?start=${nonce}`,
      expiresIn: LOGIN_TTL_SEC,
    };
  }

  /**
   * Шаг 2: бот получил `/start <nonce>` — отмечаем вход подтверждённым.
   * Вызывается из вебхука, наружу ничего не отдаёт.
   */
  async handleUpdate(update: Record<string, unknown>): Promise<void> {
    const { message } = update as TelegramUpdate;
    const from = message?.from;
    if (!message?.text || !from?.id || from.is_bot) return;

    const match = /^\/start\s+(\S+)$/.exec(message.text.trim());
    if (!match) return;

    const nonce = match[1];
    const login = await this.prisma.externalLogin.findUnique({ where: { state: nonce } });

    if (!login || login.provider !== 'telegram' || login.usedAt || login.expiresAt.getTime() < Date.now()) {
      await this.reply(message.chat?.id, 'Ссылка для входа устарела. Откройте приложение заново.');
      return;
    }

    await this.prisma.externalLogin.update({
      where: { id: login.id },
      data: {
        externalId: String(from.id),
        login: from.username ?? null,
        displayName: from.first_name ?? null,
        confirmedAt: new Date(),
      },
    });

    await this.reply(message.chat?.id, 'Готово! Возвращайтесь в приложение — вы уже вошли.');
  }

  private async reply(chatId: number | undefined, text: string): Promise<void> {
    if (!chatId) return;
    try {
      await this.call('sendMessage', { chat_id: chatId, text });
    } catch (error) {
      // Ответ в чат — вежливость, а не часть входа: молча переживём отказ.
      this.logger.warn(
        `Не удалось ответить в Telegram: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Шаг 3: приложение спрашивает, подтверждён ли вход. Когда да — возвращает
   * пользователя, которого можно пустить внутрь.
   */
  async claim(nonce: string): Promise<{ telegramId: string; firstName: string | null } | null> {
    const login = await this.prisma.externalLogin.findUnique({ where: { state: nonce } });

    if (!login) {
      throw ApiException.badRequest('TELEGRAM_LOGIN_UNKNOWN', 'Вход не найден, начните заново');
    }
    if (login.usedAt) {
      throw ApiException.badRequest('TELEGRAM_LOGIN_USED', 'Этот вход уже использован');
    }
    if (login.expiresAt.getTime() < Date.now()) {
      throw ApiException.badRequest('TELEGRAM_LOGIN_EXPIRED', 'Время на вход истекло, начните заново');
    }
    if (!login.confirmedAt || !login.externalId) {
      return null;
    }

    // Помечаем использованным сразу: пара токенов выдаётся ровно один раз.
    await this.prisma.externalLogin.update({
      where: { id: login.id },
      data: { usedAt: new Date() },
    });

    return { telegramId: login.externalId, firstName: login.displayName };
  }

  /** Подчищаем протухшие записи — их некому забирать. */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.externalLogin.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
