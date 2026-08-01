import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Review } from '../lib/api';
import { dateTime } from '../lib/format';
import { useSession } from '../lib/session';

/** Чтение отзывов и ответ заведения (раздел 5.7 ТЗ). */
export function ReviewsPage() {
  const { merchant } = useSession();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!merchant) return;
    try {
      setReviews(await api<Review[]>(`/reviews?merchantId=${merchant.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить отзывы');
    }
  }, [merchant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reply(id: string) {
    const text = drafts[id]?.trim();
    if (!text) return;

    setError(null);
    setBusyId(id);
    try {
      await api<Review>(`/reviews/${id}/reply`, { method: 'POST', body: { reply: text } });
      setDrafts((prev) => ({ ...prev, [id]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить ответ');
    } finally {
      setBusyId(null);
    }
  }

  if (!merchant) return null;

  return (
    <>
      <div className="page-head">
        <h1>Отзывы</h1>
        <span className="muted">
          {merchant.ratingCount > 0
            ? `${Number(merchant.ratingAvg).toFixed(1)} · ${merchant.ratingCount} отзывов`
            : 'отзывов пока нет'}
        </span>
      </div>

      {error && <div className="alert">{error}</div>}

      {reviews.length === 0 ? (
        <div className="empty">Отзывы появятся после того, как покупатели заберут заказы.</div>
      ) : (
        <div className="form">
          {reviews.map((review) => (
            <div className="card" key={review.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong aria-label={`Оценка ${review.rating} из 5`}>
                  {'★'.repeat(review.rating)}
                  <span className="muted">{'★'.repeat(5 - review.rating)}</span>
                </strong>
                <span className="muted">{dateTime(review.createdAt, merchant.timezone)}</span>
              </div>

              {review.comment && <p style={{ marginBottom: 0 }}>{review.comment}</p>}

              {review.reply ? (
                <p className="muted" style={{ marginBottom: 0 }}>
                  <strong>Ваш ответ:</strong> {review.reply}
                </p>
              ) : (
                <div className="form" style={{ marginTop: 12 }}>
                  <textarea
                    placeholder="Ответить покупателю"
                    value={drafts[review.id] ?? ''}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                    }
                  />
                  <div>
                    <button
                      className="btn btn--small"
                      type="button"
                      disabled={busyId === review.id || !drafts[review.id]?.trim()}
                      onClick={() => void reply(review.id)}
                    >
                      {busyId === review.id ? 'Отправляем…' : 'Ответить'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
