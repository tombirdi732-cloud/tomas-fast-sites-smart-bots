import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Order } from '../lib/api';
import { ORDER_STATUS_LABEL, dateTime, money, pickupWindow } from '../lib/format';
import { useSession } from '../lib/session';

/** Заказы и подтверждение выдачи по коду покупателя (раздел 5.5 ТЗ). */
export function OrdersPage() {
  const { merchant } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
