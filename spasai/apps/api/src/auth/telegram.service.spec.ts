import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

function makeService(overrides: Partial<Record<keyof Env, unknown>> = {}) {
  const values: Record<string, unknown> = {
    TELEGRAM_BOT_TOKEN: '123456:TEST',
    TELEGRAM_BOT_USERNAME: 'spasai_bot',
    PUBLIC_API_URL: '',
    ...overrides,
  };

  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;

  const login = {
    id: 'l1',
    nonce: 'n1',
    telegramId: null,
    username: null,
    firstName: null,
    confirmedAt: null,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };

  const prisma = {
    telegramLogin: {
      findUnique: jest.fn().mockResolvedValue(login),
      update: jest.fn().mockResolvedValue(login),
      create: jest.fn().mockResolvedValue(login),
    },
  } as unknown as PrismaService;

  return { service: new TelegramService(config, prisma), prisma, login };
}

describe('TelegramService', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
  });

  it('выключен без токена', () => {
    const { service } = makeService({ TELEGRAM_BOT_TOKEN: '' });
    expect(service.enabled).toBe(false);
  });

  it('секрет вебхука выводится из токена и не пуст', () => {
    const { service } = makeService();
    expect(service.webhookSecret.length).toBeGreaterThan(10);
    // Токен целиком в секрет не попадает: двоеточие в base64url не переживает.
    expect(service.webhookSecret).not.toContain('123456:TEST');
  });

  it('ссылка на бота содержит nonce', async () => {
    const { service } = makeService();
    const result = await service.start();
    expect(result.url).toContain('https://t.me/spasai_bot?start=');
    expect(result.url).toContain(result.nonce);
  });

  it('подтверждает вход по /start с nonce', async () => {
    const { service, prisma } = makeService();

    await service.handleUpdate({
      message: {
        text: '/start n1',
        chat: { id: 42 },
        from: { id: 777, first_name: 'Ольга', username: 'olga' },
      },
    });

    const update = (prisma.telegramLogin.update as jest.Mock).mock.calls[0][0] as {
      data: { telegramId: string; confirmedAt: Date };
    };
    expect(update.data.telegramId).toBe('777');
    expect(update.data.confirmedAt).toBeInstanceOf(Date);
  });

  it('не реагирует на сообщения ботов', async () => {
    const { service, prisma } = makeService();

    await service.handleUpdate({
      message: { text: '/start n1', chat: { id: 1 }, from: { id: 5, is_bot: true } },
    });

    expect(prisma.telegramLogin.update).not.toHaveBeenCalled();
  });

  it('не реагирует на обычный текст без nonce', async () => {
    const { service, prisma } = makeService();

    await service.handleUpdate({
      message: { text: 'привет', chat: { id: 1 }, from: { id: 5 } },
    });

    expect(prisma.telegramLogin.update).not.toHaveBeenCalled();
  });

  it('пока «Старт» не нажали, вход не выдаётся', async () => {
    const { service } = makeService();
    await expect(service.claim('n1')).resolves.toBeNull();
  });

  it('подтверждённый вход отдаётся один раз', async () => {
    const { service, prisma, login } = makeService();
    (prisma.telegramLogin.findUnique as jest.Mock).mockResolvedValue({
      ...login,
      telegramId: '777',
      firstName: 'Ольга',
      confirmedAt: new Date(),
    });

    await expect(service.claim('n1')).resolves.toEqual({
      telegramId: '777',
      firstName: 'Ольга',
    });
    // Запись помечается использованной — второй раз токены не выдать.
    expect(prisma.telegramLogin.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('просроченный вход отклоняется', async () => {
    const { service, prisma, login } = makeService();
    (prisma.telegramLogin.findUnique as jest.Mock).mockResolvedValue({
      ...login,
      confirmedAt: new Date(),
      telegramId: '777',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.claim('n1')).rejects.toThrow(/истекло/);
  });
});
