import { YandexService } from './yandex.service';

const ENV: Record<string, unknown> = {
  YANDEX_CLIENT_ID: 'client-id',
  YANDEX_CLIENT_SECRET: 'client-secret',
  PUBLIC_API_URL: 'https://spasai.ru/api',
};

const BASE_LOGIN = {
  id: 'l1',
  provider: 'yandex',
  state: 's1',
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
  const service = new YandexService(config as never, prisma as never);
  return { service, prisma };
}

/** Отвечает как настоящий Яндекс: сначала токен, потом профиль. */
function mockYandex(token: unknown, info: unknown) {
  global.fetch = jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/info') ? info : token),
    }),
  ) as unknown as typeof fetch;
}

describe('YandexService', () => {
  it('выключен без ключей', () => {
    const { service } = makeService({ env: { YANDEX_CLIENT_ID: '' } });
    expect(service.enabled).toBe(false);
  });

  it('адрес возврата строится от публичного адреса API', () => {
    const { service } = makeService();
    expect(service.redirectUri).toBe('https://spasai.ru/api/auth/yandex/callback');
  });

  it('ссылка ведёт на Яндекс и несёт state', async () => {
    const { service } = makeService();
    const result = await service.start();

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize');
    expect(url.searchParams.get('state')).toBe(result.state);
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(service.redirectUri);
    // Иначе на общем устройстве следующий человек войдёт под предыдущим.
    expect(url.searchParams.get('force_confirm')).toBe('yes');
  });

  it('обменивает код и запоминает профиль', async () => {
    mockYandex(
      { access_token: 'tok' },
      { id: '55501', login: 'olga', real_name: 'Ольга Смирнова', default_email: 'olga@ya.ru' },
    );
    const { service, prisma } = makeService();

    await expect(service.completeCallback('code', 's1')).resolves.toBe(true);
    expect(prisma.externalLogin.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: {
        externalId: '55501',
        login: 'olga',
        displayName: 'Ольга Смирнова',
        email: 'olga@ya.ru',
        confirmedAt: expect.any(Date) as Date,
      },
    });
  });

  it('отказ Яндекса не подтверждает вход', async () => {
    mockYandex({ error: 'invalid_grant', error_description: 'код протух' }, {});
    const { service, prisma } = makeService();

    await expect(service.completeCallback('code', 's1')).resolves.toBe(false);
    expect(prisma.externalLogin.update).not.toHaveBeenCalled();
  });

  it('чужой state не подтверждается', async () => {
    mockYandex({ access_token: 'tok' }, { id: '1' });
    const { service, prisma } = makeService({ login: { ...BASE_LOGIN, provider: 'telegram' } });

    await expect(service.completeCallback('code', 's1')).resolves.toBe(false);
    expect(prisma.externalLogin.update).not.toHaveBeenCalled();
  });

  it('пока не подтвердили — токены не выдаются', async () => {
    const { service } = makeService();
    await expect(service.claim('s1')).resolves.toBeNull();
  });

  it('подтверждённый вход отдаётся один раз', async () => {
    const { service, prisma } = makeService({
      login: {
        ...BASE_LOGIN,
        externalId: '55501',
        displayName: 'Ольга',
        email: 'olga@ya.ru',
        confirmedAt: new Date(),
      },
    });

    await expect(service.claim('s1')).resolves.toEqual({
      externalId: '55501',
      displayName: 'Ольга',
      email: 'olga@ya.ru',
    });
    expect(prisma.externalLogin.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { usedAt: expect.any(Date) as Date },
    });
  });

  it('просроченный вход отклоняется', async () => {
    const { service } = makeService({
      login: {
        ...BASE_LOGIN,
        externalId: '55501',
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(service.claim('s1')).rejects.toThrow(/истекло/);
  });
});
