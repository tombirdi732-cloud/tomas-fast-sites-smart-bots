import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Invite, Merchant, Verification } from '../lib/api';
import { CATEGORY_LABEL, MERCHANT_STATUS_LABEL, dateTime } from '../lib/format';

type Tab = 'pending' | 'approved' | 'rejected' | 'suspended';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pending', label: 'На модерации' },
  { key: 'approved', label: 'Одобренные' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: 'suspended', label: 'Приостановленные' },
];

/**
 * Модерация заведений (раздел 6 ТЗ).
 *
 * Автопроверка ИНН подсказывает, но не решает: одобряет человек.
 * Поэтому данные реестра показаны рядом с тем, что написали в заявке.
 */
export function AdminMerchantsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Открытая форма причины: и отказ, и приостановка требуют текста для заведения. */
  const [asking, setAsking] = useState<{ id: string; action: 'reject' | 'suspend' } | null>(null);
  const [reason, setReason] = useState('');

  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteNote, setInviteNote] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMerchants(await api<Merchant[]>(`/admin/merchants?status=${tab}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить заведения');
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'reject' | 'suspend', text?: string) {
    setBusyId(id);
    setError(null);
    try {
      await api<Merchant>(`/admin/merchants/${id}/${action}`, {
        method: 'POST',
        ...(text ? { body: { reason: text } } : {}),
      });
      setNotice(
        action === 'approve'
          ? 'Заведение одобрено — теперь оно может выставлять боксы'
          : action === 'reject'
            ? 'Заявка отклонена'
            : 'Заведение приостановлено',
      );
      setAsking(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  }

  async function createInvite() {
    setInviteBusy(true);
    setError(null);
    try {
      setInvite(
        await api<Invite>('/admin/invites', {
          method: 'POST',
          body: { note: inviteNote || undefined, expiresInDays: 14 },
        }),
      );
      setInviteNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать приглашение');
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Заведения</h1>
        <div className="row">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn--small ${tab === item.key ? '' : 'btn--ghost'}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert--ok">{notice}</div>}

      {/* Приглашение — короткий путь для заведений, с которыми уже договорились */}
      <div className="card card--outline form">
        <h2>Пригласить заведение</h2>
        <p className="muted" style={{ margin: 0 }}>
          Код для заведения, которое вы уже проверили лично. Пришедший по коду попадает в систему
          сразу, без очереди на модерацию.
        </p>
        <div className="row">
          <input
            style={{ maxWidth: 320 }}
            value={inviteNote}
            onChange={(e) => setInviteNote(e.target.value)}
            placeholder="Для кого: «Пекарня на Тверской»"
          />
          <button className="btn" type="button" onClick={() => void createInvite()} disabled={inviteBusy}>
            {inviteBusy ? 'Создаём…' : 'Выписать код'}
          </button>
        </div>

        {invite && (
          <div className="row" style={{ gap: 14 }}>
            <span className="invite-code">{invite.code}</span>
            <span className="muted">
              действует до {dateTime(invite.expiresAt, 'Europe/Moscow')}
              {invite.note ? ` · ${invite.note}` : ''}
            </span>
          </div>
        )}
      </div>

      {merchants.length === 0 ? (
        <div className="empty">
          {tab === 'pending' ? 'Новых заявок нет' : 'Здесь пока пусто'}
        </div>
      ) : (
        merchants.map((merchant) => (
          <div className="card card--outline form" key={merchant.id}>
            <div className="page-head" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2>{merchant.title}</h2>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {merchant.address}
                  {merchant.createdAt && ` · заявка от ${dateTime(merchant.createdAt, 'Europe/Moscow')}`}
                </p>
              </div>
              <span className={`pill pill--${merchant.status}`}>
                {MERCHANT_STATUS_LABEL[merchant.status] ?? merchant.status}
              </span>
            </div>

            <div className="grid-2">
              <div>
                <p className="muted" style={{ marginTop: 0 }}>
                  <strong>Из заявки</strong>
                </p>
                <dl className="dl">
                  <dt>Юрлицо</dt>
                  <dd>{merchant.legalName}</dd>
                  <dt>ИНН</dt>
                  <dd>
                    <code>{merchant.inn}</code>
                  </dd>
                  <dt>Телефон</dt>
                  <dd>{merchant.phone}</dd>
                  <dt>Категория</dt>
                  <dd>{CATEGORY_LABEL[merchant.category] ?? merchant.category}</dd>
                  <dt>Комиссия</dt>
                  <dd>{Math.round(Number(merchant.commissionRate) * 100)}%</dd>
                </dl>
              </div>

              <VerificationBlock verification={merchant.verification ?? null} />
            </div>

            {merchant.rejectionReason && (
              <div className="alert">
                {merchant.status === 'suspended' ? 'Причина приостановки' : 'Причина отказа'}:{' '}
                {merchant.rejectionReason}
              </div>
            )}

            {asking?.id === merchant.id ? (
              <div className="form">
                <label className="field">
                  <span>
                    {asking.action === 'reject'
                      ? 'Причина отказа — её увидит заведение'
                      : 'Причина приостановки — её увидит заведение'}
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      asking.action === 'reject'
                        ? 'ИНН не совпадает с названием организации в реестре'
                        : 'Жалобы покупателей: боксы не выдают в заявленное окно'
                    }
                  />
                </label>
                <div className="row">
                  <button
                    className="btn btn--danger"
                    type="button"
                    disabled={busyId === merchant.id || !reason.trim()}
                    onClick={() => void act(merchant.id, asking.action, reason.trim())}
                  >
                    {asking.action === 'reject' ? 'Отклонить заявку' : 'Приостановить'}
                  </button>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => {
                      setAsking(null);
                      setReason('');
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="row">
                {merchant.status !== 'approved' && (
                  <button
                    className="btn"
                    type="button"
                    disabled={busyId === merchant.id}
                    onClick={() => void act(merchant.id, 'approve')}
                  >
                    Одобрить
                  </button>
                )}
                {merchant.status === 'pending' && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setAsking({ id: merchant.id, action: 'reject' })}
                  >
                    Отклонить
                  </button>
                )}
                {merchant.status === 'approved' && (
                  <button
                    className="btn btn--danger"
                    type="button"
                    onClick={() => setAsking({ id: merchant.id, action: 'suspend' })}
                  >
                    Приостановить
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}

/** Что говорит реестр ФНС — рядом с тем, что написали в заявке. */
function VerificationBlock({ verification }: { verification: Verification | null }) {
  if (!verification || !verification.checked) {
    return (
      <div>
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>Реестр ФНС</strong>
        </p>
        <div className="alert alert--warn">
          Автопроверка выключена: не задан <code>DADATA_TOKEN</code>. Сверьте ИНН вручную на
          egrul.nalog.ru.
        </div>
      </div>
    );
  }

  if (!verification.found) {
    return (
      <div>
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>Реестр ФНС</strong>
        </p>
        <ul className="check-list">
          {verification.warnings.map((warning) => (
            <li key={warning}>
              <span className="check-list__mark check-list__mark--warn">!</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>Реестр ФНС</strong>
      </p>
      <dl className="dl">
        <dt>Название</dt>
        <dd>{verification.legalName ?? '—'}</dd>
        <dt>ОГРН</dt>
        <dd>{verification.ogrn ?? '—'}</dd>
        <dt>Форма</dt>
        <dd>{verification.kind === 'INDIVIDUAL' ? 'ИП' : 'Юрлицо'}</dd>
        <dt>Руководитель</dt>
        <dd>{verification.management ?? '—'}</dd>
        <dt>Юр. адрес</dt>
        <dd>{verification.address ?? '—'}</dd>
      </dl>

      <ul className="check-list" style={{ marginTop: 12 }}>
        <li>
          <span
            className={`check-list__mark check-list__mark--${verification.active ? 'ok' : 'warn'}`}
          >
            {verification.active ? '✓' : '!'}
          </span>
          <span>
            {verification.active
              ? 'Организация действующая'
              : `Статус в реестре: ${verification.status ?? 'неизвестен'}`}
          </span>
        </li>
        {verification.warnings.map((warning) => (
          <li key={warning}>
            <span className="check-list__mark check-list__mark--warn">!</span>
            <span>{warning}</span>
          </li>
        ))}
        {verification.warnings.length === 0 && verification.active && (
          <li>
            <span className="check-list__mark check-list__mark--ok">✓</span>
            <span>Название совпадает с заявкой</span>
          </li>
        )}
      </ul>
    </div>
  );
}
