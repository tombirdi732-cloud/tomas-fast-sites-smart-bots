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

  /**
   * Демо-вход без номера и кода (`POST /auth/demo`). Нужен, пока не
   * подключена рассылка SMS: иначе в приложение не попасть вообще.
   * Заводит только новый пустой аккаунт в служебном диапазоне номеров —
   * чужой аккаунт им не открыть. Выключайте, как только заработают SMS.
   */
  DEMO_LOGIN: z
    .enum(['true', 'false'])
    .default('false')
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

  /**
   * Как платит покупатель:
   *   on_pickup — бронь без предоплаты, деньги остаются между покупателем
   *               и заведением. Платформа не в денежном потоке: не нужны
   *               ни эквайринг, ни ККТ, ни агентский договор.
   *   online    — оплата в приложении через ЮKassa (нужны ИП/ООО и ключи).
   */
  PAYMENTS_MODE: z.enum(['on_pickup', 'online']).default('on_pickup'),

  /** ЮKassa. Пустые значения выключают приём платежей (этап 6). */
  YOOKASSA_SHOP_ID: z.string().default(''),
  YOOKASSA_SECRET_KEY: z.string().default(''),
  YOOKASSA_RETURN_URL: z.string().default('spasai://payment-result'),

  /** DaData: автопроверка ИНН по реестру ФНС. Пусто — только ручная модерация. */
  DADATA_TOKEN: z.string().default(''),

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
    /*
     * Ключи провайдера могут появиться позже сервера: согласование имени
     * отправителя у операторов занимает дни. Пока их нет, вход возможен
     * только демо-кнопкой — об этом громко предупреждаем, но старт не рвём.
     * А вот если и SMS не настроены, и демо-вход выключен, войти не сможет
     * никто: это уже ошибка конфигурации, и лучше упасть сразу.
     */
    const smsConfigured =
      parsed.data.SMS_PROVIDER === 'smsru'
        ? Boolean(parsed.data.SMS_API_ID)
        : Boolean(parsed.data.SMS_LOGIN && parsed.data.SMS_PASSWORD);

    if (!smsConfigured) {
      const missing =
        parsed.data.SMS_PROVIDER === 'smsru' ? 'SMS_API_ID' : 'SMS_LOGIN и SMS_PASSWORD';

      if (!parsed.data.DEMO_LOGIN) {
        throw new Error(
          `SMS_PROVIDER=${parsed.data.SMS_PROVIDER} требует ${missing}. ` +
            'Либо заполните их, либо включите DEMO_LOGIN=true — иначе войти не сможет никто.',
        );
      }

      console.warn(
        `⚠ ${missing} не заданы: SMS не отправляются, вход возможен только демо-кнопкой.`,
      );
    }

    if (parsed.data.DEMO_LOGIN) {
      console.warn(
        '⚠ DEMO_LOGIN=true: любой может завести демо-аккаунт. Выключите, когда заработают SMS.',
      );
    }
    if (parsed.data.JWT_SECRET.startsWith('dev-only')) {
      throw new Error('JWT_SECRET обязателен при NODE_ENV=production');
    }
    if (parsed.data.AUTH_HASH_SECRET.startsWith('dev-only')) {
      throw new Error('AUTH_HASH_SECRET обязателен при NODE_ENV=production');
    }
    if (
      parsed.data.PAYMENTS_MODE === 'online' &&
      (!parsed.data.YOOKASSA_SHOP_ID || !parsed.data.YOOKASSA_SECRET_KEY)
    ) {
      throw new Error(
        'PAYMENTS_MODE=online требует ключи ЮKassa, иначе покупатель не сможет заплатить',
      );
    }
  }

  return parsed.data;
}
