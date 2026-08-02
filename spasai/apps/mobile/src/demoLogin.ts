import { api, saveTokens } from './api';

/**
 * Вход без номера и кода — чтобы посмотреть приложение, пока не подключена
 * рассылка SMS.
 *
 * Аккаунт заводит сервер: приложение не выбирает номер и не подставляет код,
 * поэтому попасть этим ходом в чужой аккаунт нельзя. Работает только если
 * на сервере включён `DEMO_LOGIN=true`; иначе приходит понятный отказ.
 */
export async function loginAsDemo(): Promise<void> {
  const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/demo', {
    method: 'POST',
    auth: false,
  });

  await saveTokens(tokens.accessToken, tokens.refreshToken);
}
