import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Box } from '../lib/api';
import { BOX_STATUS_LABEL, money, pickupWindow, toKopecks } from '../lib/format';
import { useSession } from '../lib/session';

/**
 * Активные боксы и форма создания (разделы 5.3–5.4 ТЗ).
 * Поля времени вводятся в часовом поясе устройства оператора и уходят
 * в API в UTC.
 */
export function BoxesPage() {
  const { merchant } = useSession();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [recurring, setRecurring] = useState(false);

  const load = useCallback(async () => {
    if (!merchant) return;
    try {
      const list = await api<Box[]>(
        `/merchants/me/boxes?merchantId=${merchant.id}&all=${String(showAll)}`,
      );
      setBoxes(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить боксы');
    }
  }, [merchant, showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createBox(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!merchant) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await api<Box>(`/merchants/me/boxes?merchantId=${merchant.id}`, {
        method: 'POST',
        body: {
          title: data.get('title'),
          description: data.get('description') || undefined,
          originalPrice: toKopecks(String(data.get('originalPrice'))),
          price: toKopecks(String(data.get('price'))),
          quantityTotal: Number(data.get('quantityTotal')),
          bestBefore: new Date(String(data.get('bestBefore'))).toISOString(),
          pickupStart: new Date(String(data.get('pickupStart'))).toISOString(),
          pickupEnd: new Date(String(data.get('pickupEnd'))).toISOString(),
          category: data.get('category') || merchant.category,
          allergens: String(data.get('allergens') ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          isRecurring: recurring,
          ...(recurring ? { recurrenceRule: data.get('recurrenceRule') } : {}),
        },
      });
      form.reset();
      setRecurring(false);
      setFormOpen(false);
      setNotice('Бокс выставлен');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать бокс');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(box: Box) {
    setError(null);
    try {
      await api<Box>(`/merchants/me/boxes/${box.id}`, {
        method: 'PATCH',
        body: { status: 'cancelled' },
      });
      setNotice(`Бокс «${box.title}» снят с продажи`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось снять бокс');
    }
  }

  if (!merchant) return null;

  return (
    <>
      <div className="page-head">
        <h1>Боксы</h1>
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            показывать снятые и истёкшие
          </label>
          <button className="btn" type="button" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? 'Свернуть форму' : 'Новый бокс'}
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      {formOpen && (
        <form className="form card" onSubmit={createBox}>
          <h2>Новый бокс</h2>

          <label className="field">
            <span>Название</span>
            <input name="title" required minLength={2} placeholder="Бокс-сюрприз «Выпечка вечера»" />
          </label>

          <label className="field">
            <span>Что внутри</span>
            <textarea name="description" placeholder="Круассаны, булочки и половина багета" />
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Цена до скидки, ₽</span>
              <input name="originalPrice" required inputMode="decimal" placeholder="900" />
            </label>
            <label className="field">
              <span>Цена продажи, ₽</span>
              <input name="price" required inputMode="decimal" placeholder="299" />
            </label>
            <label className="field">
              <span>Количество</span>
              <input name="quantityTotal" type="number" min={1} max={1000} required defaultValue={5} />
            </label>
            <label className="field">
              <span>Категория</span>
              <input name="category" defaultValue={merchant.category} />
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <span>Начало выдачи</span>
              <input name="pickupStart" type="datetime-local" required />
            </label>
            <label className="field">
              <span>Конец выдачи</span>
              <input name="pickupEnd" type="datetime-local" required />
            </label>
            <label className="field">
              <span>Годен до</span>
              <input name="bestBefore" type="datetime-local" required />
            </label>
            <label className="field">
              <span>Аллергены через запятую</span>
              <input name="allergens" placeholder="глютен, молоко" />
            </label>
          </div>

          <div className="alert">
            Срок годности обязан наступать позже конца окна выдачи — иначе бокс не выставится.
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            повторять по расписанию
          </label>

          {recurring && (
            <label className="field">
              <span>Правило повторения</span>
              <input
                name="recurrenceRule"
                required
                defaultValue="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=20"
              />
            </label>
          )}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Выставить бокс'}
          </button>
        </form>
      )}

      {boxes.length === 0 ? (
        <div className="empty">Боксов пока нет. Выставьте первый — он появится в ленте рядом.</div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Бокс</th>
                <th>Цена</th>
                <th>Остаток</th>
                <th>Окно выдачи</th>
                <th>Годен до</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {boxes.map((box) => (
                <tr key={box.id}>
                  <td>
                    <strong>{box.title}</strong>
                    {box.isRecurring && (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        повторяется
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="price">{money(box.price)}</span>
                    <span className="was">{money(box.originalPrice)}</span>
                  </td>
                  <td>
                    {box.quantityLeft} / {box.quantityTotal}
                  </td>
                  <td>{pickupWindow(box.pickupStart, box.pickupEnd, merchant.timezone)}</td>
                  <td>
                    {new Date(box.bestBefore).toLocaleString('ru-RU', {
                      timeZone: merchant.timezone,
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <span className={`pill pill--${box.status}`}>
                      {BOX_STATUS_LABEL[box.status] ?? box.status}
                    </span>
                  </td>
                  <td>
                    {box.status === 'active' && (
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={() => void withdraw(box)}
                      >
                        Снять
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
