import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ApiError, api } from '../api';
import type { Order } from '../api';
import { Notice } from '../components';
import { ORDER_STATUS_LABEL, dayMonth, money, pickupWindow } from '../format';
import type { RootStackParamList } from '../navigation';
import { statusColors, useTheme } from '../theme';

/** Мои заказы: активные и история (экран 8 ТЗ). */
export function OrdersScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await api<Order[]>('/orders'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper }} edges={['top']}>
      <View style={{ padding: 18, paddingBottom: 8 }}>
        <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '800' }}>Мои заказы</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        contentContainerStyle={{ padding: 18, paddingTop: 0, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.inkSoft} />
        }
        ListHeaderComponent={error ? <Notice>{error}</Notice> : null}
        ListEmptyComponent={
          loading ? null : (
            <Text style={{ color: theme.inkSoft, textAlign: 'center', padding: 32, lineHeight: 22 }}>
              Заказов пока нет. Загляните в ленту — там боксы рядом с вами.
            </Text>
          )
        }
        renderItem={({ item }) => {
          const colors = statusColors(item.status, theme);
          const active = item.status === 'paid' || item.status === 'ready';

          return (
            <Pressable
              onPress={() => navigation.navigate('Order', { orderId: item.id })}
              style={({ pressed }) => ({
                backgroundColor: theme.card,
                borderColor: theme.rule,
                borderWidth: 1,
                borderRadius: 16,
                padding: 16,
                gap: 8,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ color: theme.inkSoft, fontSize: 13, flexShrink: 1 }}>
                  {item.merchant?.title ?? 'Заведение'} · {dayMonth(item.createdAt)}
                </Text>
                <View style={{ backgroundColor: colors.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}>
                  <Text style={{ color: colors.fg, fontSize: 12, fontWeight: '700' }}>
                    {ORDER_STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
              </View>

              <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '700' }}>
                {item.box?.title ?? 'Бокс'}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: theme.ink, fontSize: 20, fontWeight: '800' }}>
                  {money(item.total)}
                </Text>
                {item.box && (
                  <Text style={{ color: theme.inkSoft, fontSize: 13 }}>
                    {pickupWindow(item.box.pickupStart, item.box.pickupEnd)}
                  </Text>
                )}
              </View>

              {active && item.pickupCode && (
                <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '700', letterSpacing: 2 }}>
                  Код {item.pickupCode}
                </Text>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
