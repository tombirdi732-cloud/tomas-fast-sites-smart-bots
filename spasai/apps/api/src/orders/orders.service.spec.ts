import { BoxStatus, NotificationType, OrderStatus } from '@prisma/client';

import { BoxErrorCode, OrderErrorCode } from '../common/errors/error-codes';
import {
  CANCELLATION_GRACE_MS,
  FREE_CANCELLATION_LEAD_MS,
  OrdersService,
} from './orders.service';

const HOUR = 60 * 60 * 1000;

interface BoxState {
  id: string;
  merchantId: string;
  price: number;
  quantityLeft: number;
  quantityTotal: number;
  status: BoxStatus;
  pickupStart: Date;
  pickupEnd: Date;
}

/**
 * Прима-заглушка с одним боксом. Транзакция выполняется тем же клиентом —
 * блокировку строки мы здесь не воспроизводим, зато проверяем всю логику
 * пересчёта остатков и статусов, которая внутри неё живёт.
 */
function makeService(
  box: Partial<BoxState> = {},
  serviceFee = 2_900,
  commissionRate = 0.2,
  paymentsMode: 'on_pickup' | 'online' = 'online',
) {
  const state: BoxState = {
    id: 'b1',
    merchantId: 'm1',
    price: 29_900,
    quantityLeft: 2,
    quantityTotal: 2,
    status: BoxStatus.active,
    pickupStart: new Date(Date.now() - HOUR),
    pickupEnd: new Date(Date.now() + 3 * HOUR),
    ...box,
  };

  const createdOrders: Record<string, unknown>[] = [];

  const client = {
    $queryRaw: jest.fn(() =>
      Promise.resolve([
        {
          id: state.id,
          merchant_id: state.merchantId,
          price: state.price,
          quantity_left: state.quantityLeft,
          status: state.status,
          pickup_start: state.pickupStart,
          pickup_end: state.pickupEnd,
        },
      ]),
    ),
    merchant: {
      findUniqueOrThrow: jest.fn(() => Promise.resolve({ commissionRate, title: 'Пекарня' })),
    },
    platformSettings: {
      findUnique: jest.fn(() => Promise.resolve({ serviceFee })),
    },
    box: {
      update: jest.fn((args: { data: { quantityLeft?: number; status?: BoxStatus } }) => {
        if (args.data.quantityLeft !== undefined) state.quantityLeft = args.data.quantityLeft;
        if (args.data.status !== undefined) state.status = args.data.status;
        return Promise.resolve(state);
      }),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(state)),
    },
    order: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const order = { id: `o${createdOrders.length + 1}`, ...args.data };
        createdOrders.push(order);
        return Promise.resolve(order);
      }),
      findFirst: jest.fn(() => Promise.resolve(null)),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'o1', ...args.data }),
      ),
    },
  };

  const prisma = {
    ...client,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };

  // Уведомления в этих тестах не проверяются — подставляем заглушку.
  const notifications = { notify: jest.fn(() => Promise.resolve()) };
  const config = { get: (key: string) => (key === 'PAYMENTS_MODE' ? paymentsMode : undefined) };

  return {
    service: new OrdersService(prisma as never, notifications as never, config as never),
    state,
    prisma,
    client,
    notifications,
  };
}

describe('OrdersService.create — резервирование (раздел 7.2)', () => {
  it('уменьшает остаток и считает деньги по формулам 7.4', async () => {
    const { service, state } = makeService();

    const order = (await service.create('u1', 'b1', 2)) as unknown as {
      quantity: number;
      boxPrice: number;
      serviceFee: number;
      total: number;
      commissionAmount: number;
      status: OrderStatus;
    };

    expect(order.total).toBe(29_900 * 2 + 2_900);
    expect(order.commissionAmount).toBe(Math.round(29_900 * 2 * 0.2));
    expect(order.serviceFee).toBe(2_900);
    expect(order.status).toBe(OrderStatus.pending_payment);
    expect(state.quantityLeft).toBe(0);
  });

  it('в режиме брони без предоплаты сервисный сбор не берётся', async () => {
    const { service } = makeService({}, 2_900, 0.2, 'on_pickup');

    const order = (await service.create('u1', 'b1', 1)) as unknown as {
      serviceFee: number;
      total: number;
      commissionAmount: number;
    };

    // Покупатель платит заведению напрямую — платформе брать нечего.
    expect(order.serviceFee).toBe(0);
    expect(order.total).toBe(29_900);
    // Комиссия всё равно посчитана: это долг заведения перед платформой.
    expect(order.commissionAmount).toBe(5_980);
  });

  it('переводит бокс в sold_out, когда разобрали последний', async () => {
    const { service, state } = makeService({ quantityLeft: 1, quantityTotal: 1 });

    await service.create('u1', 'b1', 1);

    expect(state.quantityLeft).toBe(0);
    expect(state.status).toBe(BoxStatus.sold_out);
  });

  it('не даёт заказать больше, чем осталось', async () => {
    const { service, state } = makeService({ quantityLeft: 1 });

    await expect(service.create('u1', 'b1', 2)).rejects.toMatchObject({
      code: BoxErrorCode.NOT_ENOUGH_QUANTITY,
    });
    expect(state.quantityLeft).toBe(1);
  });

  it('не продаёт неактивный бокс', async () => {
    const { service } = makeService({ status: BoxStatus.sold_out });

    await expect(service.create('u1', 'b1', 1)).rejects.toMatchObject({
      code: BoxErrorCode.BOX_NOT_ACTIVE,
    });
  });

  it('не продаёт бокс с закрытым окном выдачи', async () => {
    const { service } = makeService({ pickupEnd: new Date(Date.now() - 1000) });

    await expect(service.create('u1', 'b1', 1)).rejects.toMatchObject({
      code: BoxErrorCode.BOX_NOT_ACTIVE,
    });
  });

  it('блокирует строку бокса перед списанием остатка', async () => {
    const { service, client } = makeService();

    await service.create('u1', 'b1', 1);

    // $queryRaw вызывается как tagged template: первый аргумент — массив строк.
    const calls = client.$queryRaw.mock.calls as unknown as Array<[TemplateStringsArray]>;
    expect(calls[0]?.[0].join(' ')).toContain('FOR UPDATE');
  });
});

describe('OrdersService.cancelByCustomer — отмена (раздел 7.7)', () => {
  function withOrder(overrides: {
    status?: OrderStatus;
    pickupStart?: Date;
    paidAt?: Date | null;
    createdAt?: Date;
  }) {
    const built = makeService();
    const order = {
      id: 'o1',
      userId: 'u1',
      boxId: 'b1',
      quantity: 1,
      status: overrides.status ?? OrderStatus.paid,
      paidAt: overrides.paidAt === undefined ? new Date() : overrides.paidAt,
      // По умолчанию заказ старый: грейс-период первых 15 минут уже прошёл.
      createdAt: overrides.createdAt ?? new Date(Date.now() - HOUR),
      box: {
        ...built.state,
        pickupStart: overrides.pickupStart ?? new Date(Date.now() + 5 * HOUR),
      },
    };
    built.client.order.findFirst = jest.fn(() => Promise.resolve(order)) as never;
    return built;
  }

  it('возвращает количество в бокс при отмене заранее', async () => {
    const built = withOrder({ pickupStart: new Date(Date.now() + 5 * HOUR) });
    built.state.quantityLeft = 0;
    built.state.status = BoxStatus.sold_out;

    const cancelled = (await built.service.cancelByCustomer('u1', 'o1')) as unknown as {
      status: OrderStatus;
    };

    expect(cancelled.status).toBe(OrderStatus.refunded);
    expect(built.state.quantityLeft).toBe(1);
    // Бокс снова в продаже, раз окно ещё открыто.
    expect(built.state.status).toBe(BoxStatus.active);
  });

  it('запрещает отмену позже чем за 2 часа до начала выдачи', async () => {
    const built = withOrder({ pickupStart: new Date(Date.now() + HOUR) });

    await expect(built.service.cancelByCustomer('u1', 'o1')).rejects.toMatchObject({
      code: OrderErrorCode.CANCELLATION_WINDOW_PASSED,
    });
  });

  it('неоплаченный заказ можно отменить в любой момент', async () => {
    const built = withOrder({
      status: OrderStatus.pending_payment,
      paidAt: null,
      pickupStart: new Date(Date.now() + 10 * 60 * 1000),
    });

    const cancelled = (await built.service.cancelByCustomer('u1', 'o1')) as unknown as {
      status: OrderStatus;
    };

    expect(cancelled.status).toBe(OrderStatus.cancelled);
  });

  it('уже полученный заказ отменить нельзя', async () => {
    const built = withOrder({ status: OrderStatus.collected });

    await expect(built.service.cancelByCustomer('u1', 'o1')).rejects.toMatchObject({
      code: OrderErrorCode.ORDER_NOT_CANCELLABLE,
    });
  });

  it('граница бесплатной отмены — ровно 2 часа', () => {
    expect(FREE_CANCELLATION_LEAD_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('только что оформленный заказ отменяется, даже если выдача уже скоро', async () => {
    const built = withOrder({
      createdAt: new Date(Date.now() - 60 * 1000),
      pickupStart: new Date(Date.now() + 10 * 60 * 1000),
    });
    built.state.quantityLeft = 0;

    const cancelled = (await built.service.cancelByCustomer('u1', 'o1')) as unknown as {
      status: OrderStatus;
    };

    expect(cancelled.status).toBe(OrderStatus.refunded);
    expect(built.state.quantityLeft).toBe(1);
  });

  it('грейс-период отмены заканчивается через 15 минут', async () => {
    const built = withOrder({
      createdAt: new Date(Date.now() - CANCELLATION_GRACE_MS - 1000),
      pickupStart: new Date(Date.now() + 10 * 60 * 1000),
    });

    await expect(built.service.cancelByCustomer('u1', 'o1')).rejects.toMatchObject({
      code: OrderErrorCode.CANCELLATION_WINDOW_PASSED,
    });
  });
});

describe('OrdersService.cancelByMerchant — отмена заведением', () => {
  function withOrder(status: OrderStatus) {
    const built = makeService();
    const order = {
      id: 'o1',
      userId: 'u1',
      boxId: 'b1',
      merchantId: 'm1',
      quantity: 1,
      status,
      paidAt: new Date(),
      createdAt: new Date(Date.now() - 5 * HOUR),
      box: { title: 'Пекарский бокс' },
    };
    built.client.order.findFirst = jest.fn(() => Promise.resolve(order)) as never;
    return built;
  }

  it('отменяет заказ без оглядки на окно отмены покупателя', async () => {
    const built = withOrder(OrderStatus.ready);
    built.state.quantityLeft = 0;
    built.state.status = BoxStatus.sold_out;

    const cancelled = (await built.service.cancelByMerchant('m1', 'o1')) as unknown as {
      status: OrderStatus;
    };

    expect(cancelled.status).toBe(OrderStatus.refunded);
    expect(built.state.quantityLeft).toBe(1);
    expect(built.state.status).toBe(BoxStatus.active);
  });

  it('уведомляет покупателя об отмене', async () => {
    const built = withOrder(OrderStatus.ready);

    await built.service.cancelByMerchant('m1', 'o1');

    expect(built.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: NotificationType.order_cancelled }),
    );
  });

  it('выданный заказ отменить нельзя', async () => {
    const built = withOrder(OrderStatus.collected);

    await expect(built.service.cancelByMerchant('m1', 'o1')).rejects.toMatchObject({
      code: OrderErrorCode.ORDER_NOT_CANCELLABLE,
    });
  });
});
