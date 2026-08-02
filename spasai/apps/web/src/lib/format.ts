/** Форматирование денег и дат. Деньги приходят из API в копейках. */

const rubles = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const rublesExact = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 });

/** 29900 → «299 ₽». Копейки показываем только если они есть. */
export function money(kopecks: number): string {
  return kopecks % 100 === 0
    ? `${rubles.format(kopecks / 100)} ₽`
    : `${rublesExact.format(kopecks / 100)} ₽`;
}

/** Ввод в рублях → копейки. «299,50» и «299.50» одинаково валидны. */
export function toKopecks(input: string): number {
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100);
}

/** Копейки → строка для поля ввода: 29900 → «299». */
export function fromKopecks(kopecks: number): string {
  return kopecks % 100 === 0 ? String(kopecks / 100) : (kopecks / 100).toFixed(2);
}

/**
 * UTC из API → локальное время заведения (раздел 10 ТЗ: в БД UTC,
 * пользователю показываем в таймзоне точки).
 */
export function dateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function time(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Окно выдачи одной строкой: «сегодня, 20:00–23:00». */
export function pickupWindow(startIso: string, endIso: string, timeZone: string): string {
  const start = new Date(startIso);
  const today = new Date();
  const sameDay =
    start.toLocaleDateString('ru-RU', { timeZone }) ===
    today.toLocaleDateString('ru-RU', { timeZone });

  const day = sameDay
    ? 'сегодня'
    : start.toLocaleDateString('ru-RU', { timeZone, day: 'numeric', month: 'short' });

  return `${day}, ${time(startIso, timeZone)}–${time(endIso, timeZone)}`;
}

/** Для datetime-local: ISO в UTC → значение поля в таймзоне заведения. */
export function toLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  return parts.replace(' ', 'T');
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'ждёт оплаты',
  paid: 'оплачен',
  ready: 'готов к выдаче',
  collected: 'получен',
  cancelled: 'отменён',
  refunded: 'возвращён',
  no_show: 'не забрали',
};

export const BOX_STATUS_LABEL: Record<string, string> = {
  active: 'в продаже',
  sold_out: 'разобрали',
  expired: 'истёк',
  cancelled: 'снят',
};

/** Русское склонение: 1 день, 2 дня, 5 дней. */
export function pluralDays(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${days} дня`;
  return `${days} дней`;
}

/**
 * Сколько осталось до конца срока годности и насколько это срочно.
 * Цвет — сигнал: чем меньше времени, тем горячее плашка.
 */
export function shelfLife(bestBeforeIso: string): { label: string; tone: 'fresh' | 'soon' | 'urgent' } {
  const left = new Date(bestBeforeIso).getTime() - Date.now();
  const hours = Math.floor(left / 3_600_000);

  if (left <= 0) return { label: 'истёк', tone: 'urgent' };
  if (hours < 24) return { label: hours <= 1 ? 'меньше часа' : `${hours} ч`, tone: 'urgent' };

  const days = Math.floor(hours / 24);
  if (days <= 2) return { label: pluralDays(days), tone: 'soon' };
  return { label: pluralDays(days), tone: 'fresh' };
}

export const CATEGORY_LABEL: Record<string, string> = {
  bakery: 'Пекарня',
  coffee: 'Кофейня',
  kitchen: 'Кулинария',
  restaurant: 'Ресторан',
  grocery: 'Магазин продуктов',
};

export const MERCHANT_STATUS_LABEL: Record<string, string> = {
  pending: 'на модерации',
  approved: 'одобрено',
  rejected: 'отклонено',
  suspended: 'приостановлено',
};
