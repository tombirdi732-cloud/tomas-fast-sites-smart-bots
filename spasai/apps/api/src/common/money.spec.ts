import { MoneyError, calculateOrderAmounts, discountPercent, formatKopecks } from './money';

describe('calculateOrderAmounts', () => {
  it('считает заказ из примера ТЗ: 299 ₽ × 1 + 29 ₽ сбора', () => {
    const amounts = calculateOrderAmounts({
      price: 29_900,
      quantity: 1,
      serviceFee: 2_900,
      commissionRate: 0.2,
    });

    expect(amounts).toEqual({
      boxesAmount: 29_900,
      serviceFee: 2_900,
      total: 32_800,
      commissionAmount: 5_980,
      merchantAmount: 23_920,
    });
  });

  it('умножает на количество, сбор берётся один раз за заказ', () => {
    const amounts = calculateOrderAmounts({
      price: 29_900,
      quantity: 3,
      serviceFee: 2_900,
      commissionRate: 0.2,
    });

    expect(amounts.boxesAmount).toBe(89_700);
    expect(amounts.total).toBe(92_600);
    expect(amounts.serviceFee).toBe(2_900);
  });

  it('комиссия и доля заведения в сумме дают ровно стоимость боксов', () => {
    // 33 копейки при ставке 0,185 дают дробь — округление не должно терять копейки.
    const amounts = calculateOrderAmounts({
      price: 33,
      quantity: 1,
      serviceFee: 0,
      commissionRate: 0.185,
    });

    expect(amounts.commissionAmount + amounts.merchantAmount).toBe(amounts.boxesAmount);
    expect(amounts.commissionAmount).toBe(6); // 6,105 → 6
  });

  it('не теряет копейки ни на одной ставке от 0 до 1', () => {
    for (let rate = 0; rate <= 100; rate += 1) {
      for (const price of [1, 7, 99, 12_345, 29_900]) {
        const amounts = calculateOrderAmounts({
          price,
          quantity: 2,
          serviceFee: 2_900,
          commissionRate: rate / 100,
        });
        expect(amounts.commissionAmount + amounts.merchantAmount).toBe(amounts.boxesAmount);
        expect(Number.isInteger(amounts.commissionAmount)).toBe(true);
        expect(amounts.commissionAmount).toBeLessThanOrEqual(amounts.boxesAmount);
        expect(amounts.merchantAmount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('при нулевой комиссии заведение получает всё, кроме сервисного сбора', () => {
    const amounts = calculateOrderAmounts({
      price: 10_000,
      quantity: 1,
      serviceFee: 2_900,
      commissionRate: 0,
    });

    expect(amounts.commissionAmount).toBe(0);
    expect(amounts.merchantAmount).toBe(10_000);
    expect(amounts.total).toBe(12_900);
  });

  it('отвергает дробные копейки', () => {
    expect(() =>
      calculateOrderAmounts({ price: 299.5, quantity: 1, serviceFee: 0, commissionRate: 0.2 }),
    ).toThrow(MoneyError);
  });

  it('отвергает некорректные количество и ставку', () => {
    expect(() =>
      calculateOrderAmounts({ price: 100, quantity: 0, serviceFee: 0, commissionRate: 0.2 }),
    ).toThrow(MoneyError);
    expect(() =>
      calculateOrderAmounts({ price: 100, quantity: 1, serviceFee: 0, commissionRate: 1.5 }),
    ).toThrow(MoneyError);
    expect(() =>
      calculateOrderAmounts({ price: -1, quantity: 1, serviceFee: 0, commissionRate: 0.2 }),
    ).toThrow(MoneyError);
  });
});

describe('discountPercent', () => {
  it('считает скидку для витрины', () => {
    expect(discountPercent(90_000, 29_900)).toBe(67);
    expect(discountPercent(75_000, 24_900)).toBe(67);
  });

  it('возвращает 0, если скидки нет', () => {
    expect(discountPercent(10_000, 10_000)).toBe(0);
    expect(discountPercent(0, 100)).toBe(0);
  });
});

describe('formatKopecks', () => {
  it('форматирует копейки для логов', () => {
    expect(formatKopecks(32_900)).toBe('329,00');
    expect(formatKopecks(5)).toBe('0,05');
    expect(formatKopecks(-1_250)).toBe('-12,50');
  });
});
