import { TelegramService } from './telegram.service';

const ENV: Record<string, unknown> = {
  TELEGRAM_BOT_TOKEN: '123456:TEST',
  TELEGRAM_BOT_USERNAME: 'spasai_bot',
  PUBLIC_API_URL: '',
};

const BASE_LOGIN = {
  id: 'l1',
  provider: 'telegram',
  state: 'n1',
  externalId: null as string | null,
  login: null as string | null,
  displayName: null as string | null,
  email: null as string | null,
  confirmedAt: null as Date | null,
  usedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date(),
};

function makeService(overrides: { env?: Record<string, unknown>; login?: unknown } = {}) {
  const values = { ...ENV, ...overrides.env };

  const prisma = {
    externalLogin: {
      findUnique: jest.fn(() => Promise.resolve(overrides.login ?? BASE_LOGIN)),
      update: jest.fn(() => Promise.resolve(BASE_LOGIN)),
      create: jest.fn(() => Promise.resolve(BASE_LOGIN)),
    },
  };

  const config = { get: (key: string) => values[key] };
  const service = new TelegramService(config as never, prisma as never);
  return { service, prisma };
}

describe('TelegramService', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ ok: true }) }),
    ) as unknown as typeof fetch;
  });

  it('выключен без токена', () => {
    const { service } = makeService({ env: { TELEGRAM_BOT_TOKEN: '' } });
    expect(service.enabled).toBe(false);
  });

  it('секрет вебхука выводится из токена и не содержит его целиком', () => {
    const { service } = makeService();
    expect(service.webhookSecret.length).toBeGreaterThan(10);
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

    expect(prisma.externalLogin.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: {
        externalId: '777',
        login: 'olga',
        displayName: 'Ольга',
        confirmedAt: expect.any(Date) as Date,
      },
    });
  });

  it('не реагирует на сообщения ботов', async () => {
    const { service, prisma } = makeService();

    await service.handleUpdate({
      message: { text: '/start n1', chat: { id: 1 }, from: { id: 5, is_bot: true } },
    });

    expect(prisma.externalLogin.update).not.toHaveBeenCalled();
  });

  it('не реагирует на обычный текст без nonce', async () => {
    const { service, prisma } = makeService();

    await service.handleUpdate({
      message: { text: 'привет', chat: { id: 1 }, from: { id: 5 } },
    });

    expect(prisma.externalLogin.update).not.toHaveBeenCalled();
  });

  it('пока «Старт» не нажали, вход не выдаётся', async () => {
    const { service } = makeService();
    await expect(service.claim('n1')).resolves.toBeNull();
  });

  it('подтверждённый вход отдаётся один раз', async () => {
    const { service, prisma } = makeService({
      login: {
        ...BASE_LOGIN,
        externalId: '777',
        displayName: 'Ольга',
        confirmedAt: new Date(),
      },
    });

    await expect(service.claim('n1')).resolves.toEqual({
      telegramId: '777',
      firstName: 'Ольга',
    });
    // Запись помечается использованной — второй раз токены не выдать.
    expect(prisma.externalLogin.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { usedAt: expect.any(Date) as Date },
    });
  });

  it('просроченный вход отклоняется', async () => {
    const { service } = makeService({
      login: {
        ...BASE_LOGIN,
        externalId: '777',
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(service.claim('n1')).rejects.toThrow(/истекло/);
  });

  it('чужой провайдер в записи не принимается', async () => {
    const { service, prisma } = makeService({
      login: { ...BASE_LOGIN, provider: 'yandex' },
    });

    await service.handleUpdate({
      message: { text: '/start n1', chat: { id: 1 }, from: { id: 777 } },
    });

    expect(prisma.externalLogin.update).not.toHaveBeenCalled();
  });
});
