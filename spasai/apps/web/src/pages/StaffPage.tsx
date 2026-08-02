import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Invite, StaffMember } from '../lib/api';
import { dateTime } from '../lib/format';
import { useSession } from '../lib/session';

const ROLE_LABEL: Record<string, string> = {
  owner: 'владелец',
  staff: 'сотрудник',
};

/**
 * Кто за стойкой. Выдавать заказы должен уметь каждый кассир,
 * но менять боксы и состав смены — только владелец.
 */
export function StaffPage() {
  const { me, merchant } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!merchant) return;
    try {
      setStaff(await api<StaffMember[]>(`/merchants/me/staff?merchantId=${merchant.id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить сотрудников');
    }
  }, [merchant]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!merchant) return null;

  const isOwner = staff.some((row) => row.user.id === me?.id && row.role === 'owner');

  async function createInvite() {
    if (!merchant) return;
    setBusy(true);
    setError(null);
    try {
      setInvite(
        await api<Invite>(`/merchants/me/staff/invite?merchantId=${merchant.id}`, {
          method: 'POST',
          body: { note: note || undefined, expiresInDays: 7 },
        }),
      );
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать код');
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    if (!merchant) return;
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/merchants/me/staff/${userId}?merchantId=${merchant.id}`, {
        method: 'DELETE',
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось убрать сотрудника');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Сотрудники</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {merchant.title}
          </p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {isOwner && (
        <div className="card card--outline form">
          <h2>Пригласить кассира</h2>
          <p className="muted" style={{ margin: 0 }}>
            Продиктуйте код сотруднику. Он войдёт в панель по своему номеру телефона и введёт код —
            после этого сможет принимать и выдавать заказы. Код одноразовый и живёт 7 дней.
          </p>
          <div className="row">
            <input
              style={{ maxWidth: 320 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Кому: «Ольга, утренняя смена»"
            />
            <button className="btn" type="button" onClick={() => void createInvite()} disabled={busy}>
              {busy ? 'Создаём…' : 'Выписать код'}
            </button>
          </div>

          {invite && (
            <div className="row" style={{ gap: 14 }}>
              <span className="invite-code">{invite.code}</span>
              <span className="muted">
                действует до {dateTime(invite.expiresAt, merchant.timezone)}
                {invite.note ? ` · ${invite.note}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Кто</th>
                <th>Телефон</th>
                <th>Роль</th>
                <th>В команде с</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => (
                <tr key={row.id}>
                  <td>{row.user.name ?? '—'}</td>
                  <td>{row.user.phone}</td>
                  <td>
                    <span className={`pill pill--${row.role === 'owner' ? 'approved' : 'muted'}`}>
                      {ROLE_LABEL[row.role] ?? row.role}
                    </span>
                  </td>
                  <td>{dateTime(row.createdAt, merchant.timezone)}</td>
                  <td>
                    {isOwner && row.role !== 'owner' && (
                      <button
                        className="btn btn--danger btn--small"
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(row.user.id)}
                      >
                        Убрать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {staff.length === 0 && <p className="muted">Пока только вы.</p>}
      </div>
    </>
  );
}
