import { useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Merchant } from '../lib/api';
import { useSession } from '../lib/session';

const CATEGORIES = [
  ['bakery', 'Пекарня'],
  ['coffee', 'Кофейня'],
  ['kitchen', 'Кулинария'],
  ['restaurant', 'Ресторан'],
  ['grocery', 'Магазин продуктов'],
] as const;

/** Заявка на регистрацию заведения (раздел 5.1 ТЗ) — уходит на модерацию. */
export function RegisterMerchantPage() {
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
    <div className="centered">
      <div className="auth-card" style={{ width: 'min(680px, 100%)' }}>
        <div className="logo">
          Спасай
          <small>регистрация заведения</small>
        </div>

        {error && <div className="alert">{error}</div>}

        <form className="form card" onSubmit={submit}>
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

          <label className="field">
            <span>Часовой пояс</span>
            <input name="timezone" defaultValue="Europe/Moscow" />
          </label>

          <label className="field">
            <span>Описание</span>
            <textarea name="description" placeholder="Свежая выпечка каждый день…" />
          </label>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Отправляем…' : 'Отправить на модерацию'}
          </button>

          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Пока заявка не одобрена, выставлять боксы нельзя.
          </p>
        </form>
      </div>
    </div>
  );
}
