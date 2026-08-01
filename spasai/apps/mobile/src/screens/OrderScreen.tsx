import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ApiError, api } from '../api';
import type { Order } from '../api';
import { Button, Card, Notice } from '../components';
import { ORDER_STATUS_LABEL, countdown, money, pickupWindow } from '../format';
import type { ScreenProps } from '../navigation';
import { statusColors, useTheme } from '../theme';

/** Активный заказ: крупный код выдачи и таймер до конца окна (экран 8 ТЗ). */
export function OrderScreen({ route, navigation }: ScreenProps<'Order'>) {
  const theme = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await api<Order>(`/orders/${route.params.orderId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить заказ');
    }
  }, [route.params.orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api<Order>(`/orders/${route.params.orderId}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отменить заказ');
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, justifyContent: 'center' }}>
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

  const active = order.status === 'paid' || order.status === 'ready';
  const colors = statusColors(order.status, theme);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.paper }}
      contentContainerStyle={{ padding: 18, gap: 16 }}
    >
      {error && <Notice>{error}</Notice>}

      <View>
        <Text style={{ color: theme.inkFaint, fontSize: 12, letterSpacing: 1 }}>
          {active ? 'АКТИВНЫЙ ЗАКАЗ' : 'ЗАКАЗ'}
        </Text>
        <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '800' }}>
          {order.merchant?.title ?? 'Заведение'}
        </Text>
      </View>

      {active && order.pickupCode ? (
        <View style={{ backgroundColor: theme.sticker, borderRadius: 18, padding: 22, alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.stickerInk, opacity: 0.7, letterSpacing: 3, fontSize: 12, fontWeight: '600' }}>
            КОД ВЫДАЧИ
          </Text>
          <Text style={{ color: theme.stickerInk, fontSize: 46, fontWeight: '800', letterSpacing: 6 }}>
            {order.pickupCode.slice(0, 3)} {order.pickupCode.slice(3)}
          </Text>
          <Text style={{ color: theme.stickerInk, opacity: 0.8, textAlign: 'center', fontSize: 13 }}>
            Назовите код на кассе — сотрудник введёт его в панели заведения
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 16 }}>
          <Text style={{ color: colors.fg, fontWeight: '700' }}>
            {ORDER_STATUS_LABEL[order.status] ?? order.status}
          </Text>
        </View>
      )}

      {active && order.box && (
        <View
          style={{
            backgroundColor: theme.emberWash,
            borderRadius: 14,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <Text style={{ color: theme.ember, fontSize: 24, fontWeight: '800' }}>
            {countdown(order.box.pickupEnd, now)}
          </Text>
          <Text style={{ color: theme.inkSoft, fontSize: 13 }}>до конца окна выдачи</Text>
        </View>
      )}

      <Card>
        {order.box && (
          <Line label="Забрать" value={pickupWindow(order.box.pickupStart, order.box.pickupEnd)} />
        )}
        {order.merchant && <Line label="Адрес" value={order.merchant.address} />}
        <Line label="Количество" value={`${order.quantity} шт.`} />
        <Line label="Оплачено" value={money(order.total)} last />
      </Card>

      {order.merchant && (
        <Button
          title="Проложить маршрут"
          variant="ghost"
          onPress={() =>
            void Linking.openURL(
              `geo:0,0?q=${encodeURIComponent(order.merchant?.address ?? '')}`,
            )
          }
        />
      )}

      {active && (
        <Button title="Отменить заказ" variant="ghost" onPress={() => void cancel()} loading={busy} />
      )}

      {order.status === 'collected' && (
        <Button
          title="Оставить отзыв"
          onPress={() =>
            navigation.navigate('Review', {
              orderId: order.id,
              merchantTitle: order.merchant?.title ?? '',
            })
          }
        />
      )}
    </ScrollView>
  );
}

function Line({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.rule,
      }}
    >
      <Text style={{ color: theme.inkSoft }}>{label}</Text>
      <Text style={{ color: theme.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}
