import { SmsService, STUB_CODE, buildMessage } from './sms.service';

type Env = Record<string, string>;

function makeService(env: Env) {
  const config = { get: (key: string) => env[key] ?? '' };
  return new SmsService(config as never);
}

/** Подменяет fetch и запоминает, что ушло провайдеру. */
function mockFetch(response: unknown) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];

  const fetchMock = jest.fn((url: string, init?: { body?: string }) => {
    calls.push({ url, body: new URLSearchParams(init?.body ?? '') });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    });
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return calls;
}

describe('SmsService — режим заглушки', () => {
  const service = makeService({ SMS_PROVIDER: 'stub' });

  it('всегда выдаёт код 0000', () => {
    expect(service.isStub).toBe(true);
    expect(service.generateCode()).toBe(STUB_CODE);
  });

  it('ничего не отправляет', async () => {
    const calls = mockFetch({});
    await service.send('+79990000001', '0000');
    expect(calls).toHaveLength(0);
  });
});

describe('SmsService — боевые провайдеры', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('генерирует непредсказуемый четырёхзначный код', () => {
    const service = makeService({ SMS_PROVIDER: 'smsru', SMS_API_ID: 'key' });
    const codes = new Set(Array.from({ length: 50 }, () => service.generateCode()));

    for (const code of codes) {
      expect(code).toMatch(/^\d{4}$/);
    }
    // Полсотни одинаковых кодов означали бы, что заглушка не отключилась.
    expect(codes.size).toBeGreaterThan(1);
  });

  it('sms.ru: отправляет номер, текст и имя отправителя', async () => {
    const calls = mockFetch({ status: 'OK', status_code: 100 });
    const service = makeService({
      SMS_PROVIDER: 'smsru',
      SMS_API_ID: 'test-key',
      SMS_SENDER: 'SPASAI',
    });

    await service.send('+79990000001', '1234');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('sms.ru');
    expect(calls[0]?.body.get('api_id')).toBe('test-key');
    expect(calls[0]?.body.get('to')).toBe('+79990000001');
    expect(calls[0]?.body.get('from')).toBe('SPASAI');
    expect(calls[0]?.body.get('msg')).toBe(buildMessage('1234'));
  });

  it('sms.ru: отказ приходит в теле, а не статусом — и должен стать ошибкой', async () => {
    mockFetch({ status: 'ERROR', status_code: 202, status_text: 'Неправильный номер' });
    const service = makeService({ SMS_PROVIDER: 'smsru', SMS_API_ID: 'test-key' });

    await expect(service.send('+70000000000', '1234')).rejects.toThrow(/202/);
  });

  it('smsc.ru: отправляет логин, пароль и текст', async () => {
    const calls = mockFetch({ id: 1, cnt: 1 });
    const service = makeService({
      SMS_PROVIDER: 'smsc',
      SMS_LOGIN: 'shop',
      SMS_PASSWORD: 'secret',
    });

    await service.send('+79990000002', '5678');

    expect(calls[0]?.url).toContain('smsc.ru');
    expect(calls[0]?.body.get('login')).toBe('shop');
    expect(calls[0]?.body.get('psw')).toBe('secret');
    expect(calls[0]?.body.get('phones')).toBe('+79990000002');
    expect(calls[0]?.body.get('mes')).toBe(buildMessage('5678'));
  });

  it('smsc.ru: ошибка в теле поднимается наверх', async () => {
    mockFetch({ error: 'invalid number', error_code: 7 });
    const service = makeService({ SMS_PROVIDER: 'smsc', SMS_LOGIN: 'shop', SMS_PASSWORD: 'x' });

    await expect(service.send('+70000000000', '1234')).rejects.toThrow(/invalid number/);
  });

  it('не пишет код в текст ошибки', async () => {
    mockFetch({ status: 'ERROR', status_code: 203, status_text: 'Нет текста' });
    const service = makeService({ SMS_PROVIDER: 'smsru', SMS_API_ID: 'k' });

    const error: unknown = await service.send('+79990000001', '4321').catch((e: unknown) => e);
    expect(String(error)).not.toContain('4321');
  });
});

describe('buildMessage', () => {
  it('содержит код и предупреждение', () => {
    const text = buildMessage('0000');
    expect(text).toContain('0000');
    expect(text).toContain('Спасай');
    expect(text.toLowerCase()).toContain('никому');
    // Длиннее 70 символов — это уже два SMS по цене двух.
    expect(text.length).toBeLessThanOrEqual(70);
  });
});
