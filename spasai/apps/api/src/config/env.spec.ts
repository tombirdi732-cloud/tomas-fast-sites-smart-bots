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
    expect(env.SMS_STUB).toBe(true);
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
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', SMS_STUB: 'true' }),
    ).toThrow(/SMS_STUB/);
  });

  it('разрешает production при заданных секретах', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      SMS_STUB: 'false',
      JWT_SECRET: 'prod-jwt-secret-0123456789',
      AUTH_HASH_SECRET: 'prod-hash-secret-0123456789',
    });
    expect(env.SMS_STUB).toBe(false);
  });

  it('не даёт выкатить прод с дефолтным JWT_SECRET', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', SMS_STUB: 'false' }),
    ).toThrow(/JWT_SECRET/);
  });
});
