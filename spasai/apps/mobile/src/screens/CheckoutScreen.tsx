import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, api } from '../api';
import type { BoxListItem, Order } from '../api';
import { cancellationDeadline, useAppConfig } from '../appConfig';
import { Button, Card, Notice } from '../components';
import { money, pickupWindow, time } from '../format';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

/** Оформление заказа (экран 7 ТЗ): количество, разбивка, правила, оплата. */
export function CheckoutScreen({ route, navigation }: ScreenProps<'Checkout'>) {
  const theme = useTheme();
  const config = useAppConfig();
  const [box, setBox] = useState<BoxListItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setBox(await api<BoxListItem>(`/boxes/${route.params.boxId}`));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить бокс');
      }
    })();
  }, [route.params.boxId]);

  async function order() {
    if (!box) return;
    setError(null);
    setBusy(true);
    try {
      const created = await api<{
        order: Order;
        paymentUrl: string | null;
        paymentsMode: 'on_pickup' | 'online';
      }>('/orders', {
        method: 'POST',
        body: { boxId: box.id, quantity },
      });

      // Оплата на месте: бронь уже с кодом выдачи, платить в приложении нечем.
      if (created.paymentsMode === 'on_pickup') {
        navigation.replace('Order', { orderId: created.order.id });
        return;
      }

      // Этап 6: здесь откроется оплата ЮKassa по paymentUrl.
      // Пока в dev заказ проводится напрямую.
      const paid = await api<Order>(`/orders/${created.order.id}/pay-dev`, { method: 'POST' });
      navigation.replace('Order', { orderId: paid.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось оформить заказ');
    } finally {
      setBusy(false);
    }
  }

  if (!box) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        {error ? (
          <View style={{ padding: 18 }}>
            <Notice>{error}</Notice>
          </View>
        ) : (
          <ActivityIndicator color={theme.inkSoft} />
        )}
      </View>
    );
  }

  const boxesAmount = box.price * quantity;
  const total = boxesAmount + config.serviceFee;
  const onPickup = config.paymentsMode === 'on_pickup';

  // Заказ ещё не создан, поэтому «оформлен» — это прямо сейчас.
  const cancelUntil = cancellationDeadline(
    new Date().toISOString(),
    box.pickupStart,
    config,
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        {error && <Notice>{error}</Notice>}

        <Card>
          <Text style={{ color: theme.ink, fontSize: 17, fontWeight: '700' }}>{box.title}</Text>
          <Text style={{ color: theme.inkSoft, marginTop: 4 }}>{box.merchant.title}</Text>
          <Text style={{ color: theme.inkSoft, marginTop: 8 }}>
            {pickupWindow(box.pickupStart, box.pickupEnd)} · {box.merchant.address}
          </Text>
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: theme.inkSoft }}>Количество</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Stepper label="−" onPress={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} />
              <Text style={{ color: theme.ink, fontSize: 20, fontWeight: '800', minWidth: 34, textAlign: 'center' }}>
                {quantity}
              </Text>
              <Stepper
                label="+"
                onPress={() => setQuantity((q) => Math.min(box.quantityLeft, q + 1))}
                disabled={quantity >= box.quantityLeft}
              />
            </View>
          </View>
        </Card>

        <Card>
          <Line label={`Боксы · ${quantity} шт.`} value={money(boxesAmount)} />
          {config.serviceFee > 0 && (
            <Line label="Сервисный сбор" value={money(config.serviceFee)} />
          )}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingTop: 14,
            }}
          >
            <Text style={{ color: theme.ink, fontSize: 17, fontWeight: '700' }}>
              {onPickup ? 'К оплате на месте' : 'Итого'}
            </Text>
            <Text style={{ color: theme.ink, fontSize: 26, fontWeight: '800' }}>{money(total)}</Text>
          </View>
        </Card>

        <Notice>
          {onPickup
            ? `Бокс придержат до ${time(box.pickupEnd)}, платите на кассе при получении. ` +
              `Передумали — отмените заказ до ${time(cancelUntil.toISOString())}.`
            : `Не забрали до ${time(box.pickupEnd)} — деньги не возвращаются. ` +
              `Отменить бесплатно можно до ${time(cancelUntil.toISOString())}.`}
        </Notice>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.card }}>
        <View style={{ padding: 18, borderTopWidth: 1, borderColor: theme.rule }}>
          <Button
            title={onPickup ? `Забронировать за ${money(total)}` : `Оплатить ${money(total)}`}
            onPress={() => void order()}
            loading={busy}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Stepper({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.rule,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Text style={{ color: theme.ink, fontSize: 20 }}>{label}</Text>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderColor: theme.rule,
      }}
    >
      <Text style={{ color: theme.inkSoft }}>{label}</Text>
      <Text style={{ color: theme.ink, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
