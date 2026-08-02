import { ApiError, api, saveTokens } from './api';

/**
 * Вход через Telegram — бесплатная замена SMS.
 *
 * Сервер выдаёт одноразовую ссылку на бота; пользователь жмёт там «Старт»,
 * бот сообщает об этом серверу, а приложение всё это время переспрашивает,
 * не подтвердился ли вход. Ни номера, ни кода вводить не нужно.
 */

interface StartResult {
  nonce: string;
  url: string;
  expiresIn: number;
}

type PollResult = { status: 'pending' } | { status: 'ok'; accessToken: string; refreshToken: string };

/** Раз в сколько спрашиваем сервер. Чаще незачем — человек жмёт кнопку. */
const POLL_INTERVAL_MS = 2000;

export async function startTelegramLogin(): Promise<StartResult> {
  return api<StartResult>('/auth/telegram/start', { method: 'POST', auth: false });
}

/**
 * Ждём подтверждения. Возвращает true, когда вошли; false — если время
 * вышло. `shouldStop` даёт экрану прервать ожидание (например, при уходе).
 */
export async function awaitTelegramLogin(
  nonce: string,
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
      result = await api<PollResult>('/auth/telegram/poll', {
        method: 'POST',
        body: { nonce },
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
