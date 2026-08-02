import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api';
import type { Notification } from '../api';
import { dayMonth, time } from '../format';
import { useTheme } from '../theme';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  order_paid: 'checkmark-circle-outline',
  pickup_reminder: 'alarm-outline',
  favorite_new_box: 'heart-outline',
  order_collected: 'bag-check-outline',
  refund: 'card-outline',
};

/** Лента уведомлений. Источник правды — база, пуши приходят поверх. */
export function NotificationsScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setItems(await api<Notification[]>('/notifications'));
        await api('/notifications/read', { method: 'POST', body: {} });
      } catch {
        // экран не критичен
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
            <Ionicons name="notifications-off-outline" size={40} color={theme.inkFaint} />
            <Text style={{ color: theme.inkSoft, textAlign: 'center' }}>
              Уведомлений пока нет
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: item.isRead ? theme.bg : theme.greenWash,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={ICON[item.type] ?? 'notifications-outline'}
                size={20}
                color={item.isRead ? theme.inkSoft : theme.green}
              />
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '700' }}>
                {item.title}
              </Text>
              <Text style={{ color: theme.inkSoft, fontSize: 14, lineHeight: 20 }}>
                {item.body}
              </Text>
              <Text style={{ color: theme.inkFaint, fontSize: 12, marginTop: 2 }}>
                {dayMonth(item.createdAt)}, {time(item.createdAt)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
