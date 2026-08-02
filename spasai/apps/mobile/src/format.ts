/** Форматирование для интерфейса. Деньги приходят в копейках. */

export function money(kopecks: number): string {
  const rubles = kopecks / 100;
  const value = kopecks % 100 === 0 ? String(rubles) : rubles.toFixed(2);
  return `${value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
}

/** 350 → «350 м», 1240 → «1,2 км». */
export function distance(meters: number): string {
  return meters < 1000 ? `${meters} м` : `${(meters / 1000).toFixed(1).replace('.', ',')} км`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function time(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MONTHS = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

export function dayMonth(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
}

/** «сегодня, 20:00–23:00» */
export function pickupWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const today = new Date();
  const sameDay =
    start.getDate() === today.getDate() &&
    start.getMonth() === today.getMonth() &&
    start.getFullYear() === today.getFullYear();

  return `${sameDay ? 'сегодня' : dayMonth(startIso)}, ${time(startIso)}–${time(endIso)}`;
}

export function bestBeforeLabel(iso: string): string {
  return `Годен до ${dayMonth(iso)}, ${time(iso)}`;
}

/** Обратный отсчёт «01:47:12» до момента. */
export function countdown(toIso: string, now: number = Date.now()): string {
  const left = Math.max(0, new Date(toIso).getTime() - now);
  const seconds = Math.floor(left / 1000);
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/** Русское склонение: 1 бокс, 2 бокса, 5 боксов. */
export function pluralBoxes(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} бокс`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} бокса`;
  return `${count} боксов`;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'ждёт оплаты',
  paid: 'к получению',
  ready: 'готов',
  collected: 'получен',
  cancelled: 'отменён',
  refunded: 'возвращён',
  no_show: 'не забрали',
};
