/**
 * Денежная арифметика платформы. Все суммы — целые числа в копейках,
 * никаких float (раздел 10 ТЗ).
 *
 * Формулы раздела 7.4:
 *   boxesAmount      = price * quantity
 *   total            = boxesAmount + serviceFee      // платит покупатель
 *   commissionAmount = boxesAmount * commissionRate  // забирает платформа
 *   merchantAmount   = boxesAmount - commissionAmount
 *
 * Сервисный сбор — доход платформы сверх комиссии, заведению он не идёт.
 */

export interface OrderAmountsInput {
  /** Цена одного бокса, копейки. */
  price: number;
  quantity: number;
  /** Сервисный сбор за заказ, копейки. */
  serviceFee: number;
  /** Доля комиссии, 0..1. */
  commissionRate: number;
}

export interface OrderAmounts {
  boxesAmount: number;
  serviceFee: number;
  total: number;
  commissionAmount: number;
  merchantAmount: number;
}

export class MoneyError extends Error {}

function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${name} должно быть целым числом копеек, получено ${value}`);
  }
}

/**
 * Считает разбивку заказа. Комиссия округляется до копейки по правилу
 * «половина вверх»; из-за округления `merchantAmount + commissionAmount`
 * всегда точно равно `boxesAmount` — остаток отдаётся заведению.
 */
export function calculateOrderAmounts(input: OrderAmountsInput): OrderAmounts {
  const { price, quantity, serviceFee, commissionRate } = input;

  assertInteger(price, 'price');
  assertInteger(serviceFee, 'serviceFee');
  assertInteger(quantity, 'quantity');

  if (price < 0) throw new MoneyError('Цена не может быть отрицательной');
  if (serviceFee < 0) throw new MoneyError('Сервисный сбор не может быть отрицательным');
  if (quantity <= 0) throw new MoneyError('Количество должно быть положительным');
  if (commissionRate < 0 || commissionRate > 1) {
    throw new MoneyError(`Ставка комиссии должна быть в диапазоне 0..1, получено ${commissionRate}`);
  }

  const boxesAmount = price * quantity;
  const commissionAmount = Math.round(boxesAmount * commissionRate);

  return {
    boxesAmount,
    serviceFee,
    total: boxesAmount + serviceFee,
    commissionAmount,
    merchantAmount: boxesAmount - commissionAmount,
  };
}

/** Скидка в процентах для витрины: 900 ₽ → 299 ₽ даёт 67. */
export function discountPercent(originalPrice: number, price: number): number {
  if (originalPrice <= 0 || price >= originalPrice) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/** Копейки → рубли строкой, для логов и чеков: 32900 → «329,00». */
export function formatKopecks(kopecks: number): string {
  const sign = kopecks < 0 ? '-' : '';
  const abs = Math.abs(kopecks);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
