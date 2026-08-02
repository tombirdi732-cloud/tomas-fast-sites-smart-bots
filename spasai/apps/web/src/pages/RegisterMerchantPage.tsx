import { useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Merchant } from '../lib/api';
import { Logo } from '../components/Logo';
import { useSession } from '../lib/session';

const CATEGORIES = [
  ['bakery', 'Пекарня'],
  ['coffee', 'Кофейня'],
  ['kitchen', 'Кулинария'],
  ['restaurant', 'Ресторан'],
  ['grocery', 'Магазин продуктов'],
] as const;

/**
 * Две двери в панель (раздел 5.1 ТЗ и система доступа):
 *   • сотрудник входит по коду от владельца;
 *   • заведение подаёт заявку — сразу одобряется, если пришло по коду от платформы.
 */
export function RegisterMerchantPage() {
  const [mode, setMode] = useState<'join' | 'apply'>('join');

  return (
    <div className="centered">
      <div className="auth-card" style={{ width: 'min(680px, 100%)' }}>
        <Logo caption="доступ к панели" />

        <div className="row">
          <button
            type="button"
            className={`btn btn--small ${mode === 'join' ? '' : 'btn--ghost'}`}
            onClick={() => setMode('join')}
          >
            У меня есть код
          </button>
          <button
            type="button"
            className={`btn btn--small ${mode === 'apply' ? '' : 'btn--ghost'}`}
            onClick={() => setMode('apply')}
          >
            Зарегистрировать заведение
          </button>
        </div>

        {mode === 'join' ? <JoinForm /> : <ApplyForm />}
      </div>
    </div>
  );
}

/** Вход сотрудника по коду, который выдал владелец заведения. */
function JoinForm() {
  const { reload } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api<Merchant>('/merchants/join', { method: 'POST', body: { code: code.trim() } });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти по коду');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      {error && <div className="alert">{error}</div>}

      <label className="field">
        <span>Код приглашения</span>
        <input
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="AB12CD34"
          maxLength={16}
          autoCapitalize="characters"
          required
        />
      </label>

      <button className="btn" type="submit" disabled={busy || code.trim().length < 6}>
        {busy ? 'Проверяем…' : 'Войти в заведение'}
      </button>

      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Код даёт владелец заведения. Если вы регистрируете точку впервые — перейдите на вкладку
        «Зарегистрировать заведение».
      </p>
    </form>
  );
}

/** Заявка на регистрацию заведения — уходит на модерацию. */
function ApplyForm() {
  const { reload } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const data = new FormData(event.currentTarget);
    try {
      await api<Merchant>('/merchants', {
        method: 'POST',
        body: {
          title: data.get('title'),
          description: data.get('description') || undefined,
          category: data.get('category'),
          address: data.get('address'),
          lat: Number(data.get('lat')),
          lng: Number(data.get('lng')),
          phone: data.get('phone'),
          inn: data.get('inn'),
          legalName: data.get('legalName'),
          timezone: data.get('timezone') || undefined,
          inviteCode: (data.get('inviteCode') as string)?.trim() || undefined,
        },
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      {error && <div className="alert">{error}</div>}

      <label className="field">
        <span>Название</span>
        <input name="title" required minLength={2} placeholder="Пекарня «Тёплый хлеб»" />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Категория</span>
          <select name="category" required defaultValue="bakery">
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Телефон точки</span>
          <input name="phone" required placeholder="+74950000001" />
        </label>
      </div>

      <label className="field">
        <span>Адрес</span>
        <input name="address" required placeholder="Москва, ул. Тверская, 1" />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Широта</span>
          <input name="lat" type="number" step="any" required placeholder="55.7601" />
        </label>
        <label className="field">
          <span>Долгота</span>
          <input name="lng" type="number" step="any" required placeholder="37.6089" />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>ИНН</span>
          <input name="inn" required pattern="\d{10}|\d{12}" placeholder="7701234567" />
        </label>
        <label className="field">
          <span>Юридическое название</span>
          <input name="legalName" required placeholder="ООО «Тёплый хлеб»" />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Часовой пояс</span>
          <input name="timezone" defaultValue="Europe/Moscow" />
        </label>
        <label className="field">
          <span>Код от «Спасай» — если есть</span>
          <input name="inviteCode" placeholder="AB12CD34" maxLength={16} />
        </label>
      </div>

      <label className="field">
        <span>Описание</span>
        <textarea name="description" placeholder="Свежая выпечка каждый день…" />
      </label>

      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Отправляем…' : 'Отправить заявку'}
      </button>

      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        ИНН сверяется с реестром ФНС автоматически, решение принимает модератор. По коду от «Спасай»
        заведение подключается сразу. Пока заявка не одобрена, выставлять боксы нельзя.
      </p>
    </form>
  );
}
