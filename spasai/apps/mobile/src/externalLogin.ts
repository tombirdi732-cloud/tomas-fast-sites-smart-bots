import { ApiError, api, saveTokens } from './api';

/**
 * Вход через внешний сервис — бесплатная замена SMS.
 *
 * Сервер выдаёт одноразовую ссылку, пользователь подтверждает вход на
 * стороне сервиса, а приложение всё это время переспрашивает, не
 * подтвердилось ли. Ни номера, ни кода вводить не нужно.
 *
 * Яндекс — основной путь: он работает с российского хостинга.
 * Telegram оставлен как второй, но с российского сервера до него
 * трафик не проходит.
 */

interface StartResult {
  state: string;
  url: string;
  expiresIn: number;
}

type PollResult = { status: 'pending' } | { status: 'ok'; accessToken: string; refreshToken: string };

/** Раз в сколько спрашиваем сервер. Чаще незачем — человек жмёт кнопку. */
const POLL_INTERVAL_MS = 2000;

export type Provider = 'yandex' | 'telegram';

export async function startExternalLogin(provider: Provider): Promise<StartResult> {
  const result = await api<{ url: string; expiresIn: number; state?: string; nonce?: string }>(
    `/auth/${provider}/start`,
    { method: 'POST', auth: false },
  );
  // Telegram называет ключ nonce, Яндекс — state; наружу отдаём одинаково.
  return { url: result.url, expiresIn: result.expiresIn, state: result.state ?? result.nonce! };
}

/**
 * Ждём подтверждения. Возвращает true, когда вошли; false — если время
 * вышло. `shouldStop` даёт экрану прервать ожидание (например, при уходе).
 */
export async function awaitExternalLogin(
  provider: Provider,
  state: string,
  expiresIn: number,
  shouldStop: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    if (shouldStop()) return false;

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (shouldStop()) return false;

    let result: PollResult;
    try {
      result = await api<PollResult>(`/auth/${provider}/poll`, {
        method: 'POST',
        body: provider === 'telegram' ? { nonce: state } : { state },
        auth: false,
      });
    } catch (error) {
      // Просроченную или использованную ссылку переспрашивать бессмысленно.
      if (error instanceof ApiError && error.status === 400) throw error;
      continue; // сеть моргнула — пробуем ещё
    }

    if (result.status === 'ok') {
      await saveTokens(result.accessToken, result.refreshToken);
      return true;
    }
  }

  return false;
}
