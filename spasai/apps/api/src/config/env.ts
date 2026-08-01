import { z } from 'zod';

/**
 * Схема переменных окружения. Приложение не стартует, если что-то не так —
 * лучше упасть на старте, чем на первом запросе.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /** Разрешённые Origin через запятую, либо `*` в dev. */
  CORS_ORIGINS: z.string().default('*'),

  /**
   * Провайдер SMS. `stub` — код всегда 0000 и ничего не отправляется
   * (этап 2 ТЗ); в production обязан быть настоящий провайдер.
   */
  SMS_PROVIDER: z.enum(['stub', 'smsru', 'smsc']).default('stub'),
  /** sms.ru: api_id из личного кабинета. */
  SMS_API_ID: z.string().default(''),
  /** smsc.ru: логин и пароль клиента. */
  SMS_LOGIN: z.string().default(''),
  SMS_PASSWORD: z.string().default(''),
  /** Согласованное с оператором имя отправителя. Пусто — имя по умолчанию. */
  SMS_SENDER: z.string().default(''),

  /** Подпись JWT. В production обязателен собственный секрет. */
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me'),
  /** Время жизни access-токена, секунды. */
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(15 * 60),
  /** Время жизни refresh-токена, секунды. */
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(30 * 24 * 3600),
  /** Секрет для HMAC-хэширования SMS-кодов и refresh-токенов в БД. */
  AUTH_HASH_SECRET: z.string().min(16).default('dev-only-hash-secret-change-me'),

  /** Время жизни SMS-кода, секунды. */
  SMS_CODE_TTL: z.coerce.number().int().positive().default(5 * 60),
  /** Не чаще одного кода в минуту на номер (раздел 10 ТЗ). */
  SMS_RESEND_COOLDOWN: z.coerce.number().int().positive().default(60),
  /** Сколько раз можно ошибиться в коде, прежде чем он сгорит. */
  SMS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  /** ЮKassa. Пустые значения выключают приём платежей (этап 6). */
  YOOKASSA_SHOP_ID: z.string().default(''),
  YOOKASSA_SECRET_KEY: z.string().default(''),
  YOOKASSA_RETURN_URL: z.string().default('spasai://payment-result'),

  /** Firebase Cloud Messaging (этап 7). Пустое значение выключает пуши. */
  FCM_PROJECT_ID: z.string().default(''),
  FCM_CLIENT_EMAIL: z.string().default(''),
  FCM_PRIVATE_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${details}`);
  }

  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.SMS_PROVIDER === 'stub') {
      throw new Error(
        'SMS_PROVIDER=stub недопустим при NODE_ENV=production: вход по коду 0000 открыт всем',
      );
    }
    if (parsed.data.SMS_PROVIDER === 'smsru' && !parsed.data.SMS_API_ID) {
      throw new Error('SMS_PROVIDER=smsru требует SMS_API_ID');
    }
    if (
      parsed.data.SMS_PROVIDER === 'smsc' &&
      (!parsed.data.SMS_LOGIN || !parsed.data.SMS_PASSWORD)
    ) {
      throw new Error('SMS_PROVIDER=smsc требует SMS_LOGIN и SMS_PASSWORD');
    }
    if (parsed.data.JWT_SECRET.startsWith('dev-only')) {
      throw new Error('JWT_SECRET обязателен при NODE_ENV=production');
    }
    if (parsed.data.AUTH_HASH_SECRET.startsWith('dev-only')) {
      throw new Error('AUTH_HASH_SECRET обязателен при NODE_ENV=production');
    }
  }

  return parsed.data;
}
