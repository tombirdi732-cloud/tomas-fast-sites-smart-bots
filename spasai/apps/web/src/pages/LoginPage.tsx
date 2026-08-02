import { useRef, useState } from 'react';

import { ApiError, api, tokens } from '../lib/api';
import { Logo } from '../components/Logo';
import { useSession } from '../lib/session';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface YandexStart {
  state: string;
  url: string;
  expiresIn: number;
}

type YandexPoll = { status: 'pending' } | ({ status: 'ok' } & Tokens);

/**
 * Вход в панель через Яндекс ID.
 *
 * Единственный способ: SMS платные и требуют ИП, Telegram с российского
 * хостинга недоступен. Яндекс бесплатен и работает в один шаг.
 */
export function LoginPage() {
  const { reload } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const cancelled = useRef(false);

  async function login() {
    setError(null);
    setBusy(true);

    // Вкладку открываем ДО запроса к серверу. Браузер разрешает
    // window.open только в том же такте, что и клик: после await он
    // считает окно непрошеным и молча его блокирует.
    const tab = window.open('', '_blank');

    try {
      const start = await api<YandexStart>('/auth/yandex/start', {
        method: 'POST',
        auth: false,
      });

      if (tab) {
        tab.location.href = start.url;
      } else {
        // Всплывающие окна запрещены — уходим на Яндекс в этой же вкладке.
        window.location.href = start.url;
        return;
      }

      cancelled.current = false;
      setWaiting(true);

      const deadline = Date.now() + start.expiresIn * 1000;
      while (Date.now() < deadline && !cancelled.current) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (cancelled.current) break;

        const result = await api<YandexPoll>('/auth/yandex/poll', {
          method: 'POST',
          body: { state: start.state },
          auth: false,
        });

        if (result.status === 'ok') {
          tokens.save(result.accessToken, result.refreshToken);
          await reload();
          return;
        }
      }

      if (!cancelled.current) setError('Время на вход истекло. Попробуйте ещё раз.');
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiError ? err.message : 'Не удалось войти через Яндекс');
    } finally {
      setWaiting(false);
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <div className="auth-card">
        <Logo caption="панель заведения" />

        {error && <div className="alert">{error}</div>}

        <div className="form card">
          {waiting ? (
            <>
              <div className="alert alert--ok">
                Открыли Яндекс в соседней вкладке. Подтвердите вход — здесь всё случится само.
              </div>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  cancelled.current = true;
                  setWaiting(false);
                }}
              >
                Отмена
              </button>
            </>
          ) : (
            <>
              <button className="btn" type="button" onClick={() => void login()} disabled={busy}>
                {busy ? 'Открываем…' : 'Войти через Яндекс'}
              </button>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Панель для заведений: боксы, заказы и выдача по коду покупателя.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
