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

  if (parsed.data.NODE_ENV === 'production' && parsed.data.SMS_STUB) {
    throw new Error('SMS_STUB=true недопустим при NODE_ENV=production');
  }

  return parsed.data;
}
