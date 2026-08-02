import { useState } from 'react';

import { ApiError, api, tokens } from '../lib/api';
import { Logo } from '../components/Logo';
import { useSession } from '../lib/session';

interface RequestCodeResponse {
  retryAfter: number;
  devCode?: string;
}

interface VerifyResponse {
  accessToken: string;
  refreshToken: string;
}

/** Вход по номеру телефона и SMS-коду. В dev код всегда 0000. */
export function LoginPage() {
  const { reload } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api<RequestCodeResponse>('/auth/request-code', {
        method: 'POST',
        body: { phone },
        auth: false,
      });
      setStep('code');
      setHint(
        result.devCode
          ? `Dev-режим: код ${result.devCode} — SMS не отправляется`
          : 'Код отправлен на указанный номер',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Вход без номера и кода. Нужен, пока не подключены SMS: иначе в панель
   * не попасть вообще. Аккаунт заводит сервер и только новый — чужой
   * этим ходом не открыть. Работает лишь при DEMO_LOGIN=true.
   */
  async function demo() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<VerifyResponse>('/auth/demo', {
        method: 'POST',
        auth: false,
      });
      tokens.save(result.accessToken, result.refreshToken);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти без кода');
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api<VerifyResponse>('/auth/verify-code', {
        method: 'POST',
        body: { phone, code, ...(name ? { name } : {}) },
        auth: false,
      });
      tokens.save(result.accessToken, result.refreshToken);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <div className="auth-card">
        <Logo caption="панель заведения" />

        {error && <div className="alert">{error}</div>}

        {step === 'phone' ? (
          <form className="form card" onSubmit={requestCode}>
            <label className="field">
              <span>Телефон</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 999 123-45-67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <button className="btn" type="submit" disabled={busy || phone.length < 10}>
              {busy ? 'Отправляем…' : 'Получить код'}
            </button>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Код можно запросить не чаще одного раза в минуту.
            </p>

            <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '4px 0' }} />

            <button className="btn btn--ghost" type="button" onClick={() => void demo()} disabled={busy}>
              Войти без кода
            </button>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Временный вход, пока не подключена рассылка SMS. Выключается на сервере
              флагом <code>DEMO_LOGIN</code>.
            </p>
          </form>
        ) : (
          <form className="form card" onSubmit={verify}>
            {hint && <div className="alert alert--ok">{hint}</div>}
            <label className="field">
              <span>Код из SMS</span>
              <input
                className="code-input"
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </label>
            <label className="field">
              <span>Как к вам обращаться</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ольга"
                autoComplete="name"
              />
            </label>
            <div className="row">
              <button className="btn" type="submit" disabled={busy || code.length !== 4}>
                {busy ? 'Проверяем…' : 'Войти'}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setHint(null);
                }}
              >
                Изменить номер
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
