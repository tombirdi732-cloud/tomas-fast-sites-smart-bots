import { useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { MerchantStats } from '../lib/api';
import { MERCHANT_STATUS_LABEL, money } from '../lib/format';
import { useSession } from '../lib/session';

/** Дашборд заведения (раздел 5.2 ТЗ). */
export function DashboardPage() {
  const { merchant } = useSession();
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!merchant) return;
    api<MerchantStats>(`/merchants/me/stats?merchantId=${merchant.id}`)
      .then(setStats)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить статистику'),
      );
  }, [merchant]);

  if (!merchant) return null;

  const pendingModeration = merchant.status !== 'approved';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{merchant.title}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {merchant.address} · комиссия {Math.round(Number(merchant.commissionRate) * 100)}%
          </p>
        </div>
        <span className={`pill pill--${merchant.status === 'approved' ? 'active' : 'warn'}`}>
          {MERCHANT_STATUS_LABEL[merchant.status] ?? merchant.status}
        </span>
      </div>

      {pendingModeration && (
        <div className="alert">
          Заведение ещё не одобрено модератором — выставлять боксы нельзя.
          {merchant.rejectionReason && <> Причина отказа: {merchant.rejectionReason}</>}
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      {stats && (
        <>
          <div className="stats">
            <div className="card">
              <div className="stat__num">{stats.ordersToday}</div>
              <div className="stat__label">заказов сегодня</div>
            </div>
            <div className="card">
              <div className="stat__num">{money(stats.revenueToday)}</div>
              <div className="stat__label">выручка сегодня</div>
            </div>
            <div className="card">
              <div className="stat__num">{money(stats.revenueToday - stats.commissionToday)}</div>
              <div className="stat__label">к перечислению сегодня</div>
            </div>
            <div className="card">
              <div className="stat__num">{stats.boxesSavedTotal}</div>
              <div className="stat__label">боксов спасено всего</div>
            </div>
          </div>

          <div className="stats">
            <div className="card">
              <div className="stat__num">{stats.activeBoxes}</div>
              <div className="stat__label">боксов в продаже</div>
            </div>
            <div className="card">
              <div className="stat__num">{stats.ordersTotal}</div>
              <div className="stat__label">заказов за всё время</div>
            </div>
            <div className="card">
              <div className="stat__num">
                {stats.ratingCount > 0 ? stats.ratingAvg.toFixed(1) : '—'}
              </div>
              <div className="stat__label">рейтинг ({stats.ratingCount} отзывов)</div>
            </div>
            <div className="card">
              <div className="stat__num">{money(stats.commissionToday)}</div>
              <div className="stat__label">комиссия платформы сегодня</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
