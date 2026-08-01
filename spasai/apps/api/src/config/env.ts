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
   * В dev SMS не отправляются, код всегда 0000 (этап 2 ТЗ).
   * В production флаг обязан быть false.
   */
  SMS_STUB: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

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
    if (parsed.data.SMS_STUB) {
      throw new Error('SMS_STUB=true недопустим при NODE_ENV=production');
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
