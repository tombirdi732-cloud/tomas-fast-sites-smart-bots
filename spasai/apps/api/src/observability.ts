import * as Sentry from '@sentry/nestjs';

/**
 * Sentry (этап 9 ТЗ). Инициализация обязана произойти до импорта
 * AppModule, поэтому файл подключается первым в main.ts.
 * Без DSN ничего не включается — в dev шум не нужен.
 */
export function initObservability(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,
    // Трейсим десятую часть запросов: достаточно для картины, дёшево по квоте.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Телефоны и коды выдачи — персональные данные, наружу их не отправляем.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.data) delete event.request.data;
      return event;
    },
  });

  return true;
}
