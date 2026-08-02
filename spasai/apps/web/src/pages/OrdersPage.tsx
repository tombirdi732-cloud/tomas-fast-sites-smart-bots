import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Order } from '../lib/api';
import { ORDER_STATUS_LABEL, dateTime, money, pickupWindow } from '../lib/format';
import { useSession } from '../lib/session';

/** Заказы, которые заведение ещё может отменить. */
const CANCELLABLE = ['pending_payment', 'paid', 'ready'];

/** Заказы и подтверждение выдачи по коду покупателя (раздел 5.5 ТЗ). */
export function OrdersPage() {
  const { merchant } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Заказ, по которому переспрашиваем перед отменой. */
  const [asking, setAsking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!merchant) return;
    try {
      const list = await api<Order[]>(
        `/merchants/me/orders?merchantId=${merchant.id}&pending=${String(pendingOnly)}`,
      );
      setOrders(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить заказы');
    }
  }, [merchant, pendingOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function collect(event: React.FormEvent) {
    event.preventDefault();
    if (!merchant) return;

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const order = await api<Order>(`/merchants/me/orders/collect?merchantId=${merchant.id}`, {
        method: 'POST',
        body: { pickupCode: code },
      });
      setNotice(`Заказ выдан: ${order.quantity} шт. на ${money(order.total)}`);
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось подтвердить выдачу');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Отмена со стороны заведения: еда закончилась или покупатель позвонил
   * и попросил отменить. Бокс возвращается в продажу, покупателю уходит
   * уведомление — поэтому переспрашиваем.
   */
  async function cancel(orderId: string) {
    if (!merchant) return;

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api<Order>(`/merchants/me/orders/${orderId}/cancel?merchantId=${merchant.id}`, {
        method: 'POST',
      });
      setNotice('Заказ отменён, бокс вернулся в продажу. Покупатель получил уведомление.');
      setAsking(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отменить заказ');
    } finally {
      setBusy(false);
    }
  }

  if (!merchant) return null;

  return (
    <>
      <div className="page-head">
        <h1>Заказы</h1>
        <label className="check">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          только ожидающие выдачи
        </label>
      </div>

      <form className="card form" onSubmit={collect}>
        <h2>Выдать заказ</h2>
        <p className="muted" style={{ margin: 0 }}>
          Попросите покупателя назвать шестизначный код из приложения.
        </p>
        <div className="row">
          <input
            className="code-input"
            style={{ maxWidth: 240 }}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button className="btn" type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Проверяем…' : 'Подтвердить выдачу'}
          </button>
        </div>
      </form>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      {orders.length === 0 ? (
        <div className="empty">
          {pendingOnly ? 'Заказов, ожидающих выдачи, нет.' : 'Заказов пока нет.'}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Бокс</th>
                <th>Кол-во</th>
                <th>Сумма</th>
                <th>Комиссия</th>
                <th>Окно выдачи</th>
                <th>Оплачен</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span className="price">{order.pickupCode ?? '—'}</span>
                  </td>
                  <td>{order.box?.title ?? '—'}</td>
                  <td>{order.quantity}</td>
                  <td>{money(order.total)}</td>
                  <td className="muted">{money(order.commissionAmount)}</td>
                  <td>
                    {order.box
                      ? pickupWindow(order.box.pickupStart, order.box.pickupEnd, merchant.timezone)
                      : '—'}
                  </td>
                  <td className="muted">
                    {order.paidAt ? dateTime(order.paidAt, merchant.timezone) : '—'}
                  </td>
                  <td>
                    <span className={`pill pill--${order.status}`}>
                      {ORDER_STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </td>
                  <td>
                    {CANCELLABLE.includes(order.status) &&
                      (asking === order.id ? (
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn--danger btn--small"
                            type="button"
                            disabled={busy}
                            onClick={() => void cancel(order.id)}
                          >
                            Точно отменить
                          </button>
                          <button
                            className="btn btn--ghost btn--small"
                            type="button"
                            onClick={() => setAsking(null)}
                          >
                            Нет
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={() => setAsking(order.id)}
                        >
                          Отменить
                        </button>
                      ))}
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
