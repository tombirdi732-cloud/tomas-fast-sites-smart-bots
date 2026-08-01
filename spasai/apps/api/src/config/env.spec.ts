import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://spasai:spasai@localhost:5432/spasai?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('подставляет значения по умолчанию', () => {
    const env = validateEnv({ ...base });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api');
    expect(env.SMS_PROVIDER).toBe('stub');
  });

  it('приводит PORT к числу', () => {
    expect(validateEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('падает без DATABASE_URL', () => {
    expect(() => validateEnv({ REDIS_URL: base.REDIS_URL })).toThrow(
      /Некорректная конфигурация окружения/,
    );
  });

  it('запрещает SMS-заглушку в production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SMS_PROVIDER/);
  });

  it('требует ключ провайдера в production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', SMS_PROVIDER: 'smsru' }),
    ).toThrow(/SMS_API_ID/);

    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', SMS_PROVIDER: 'smsc', SMS_LOGIN: 'x' }),
    ).toThrow(/SMS_LOGIN и SMS_PASSWORD/);
  });

  it('разрешает production при заданных секретах', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      SMS_PROVIDER: 'smsru',
      SMS_API_ID: 'test-api-id',
      JWT_SECRET: 'prod-jwt-secret-0123456789',
      AUTH_HASH_SECRET: 'prod-hash-secret-0123456789',
    });
    expect(env.SMS_PROVIDER).toBe('smsru');
  });

  it('не даёт выкатить прод с дефолтным JWT_SECRET', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        SMS_PROVIDER: 'smsru',
        SMS_API_ID: 'test-api-id',
      }),
    ).toThrow(/JWT_SECRET/);
  });
});
