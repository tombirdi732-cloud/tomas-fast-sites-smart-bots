import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api';
import type { Order } from '../api';
import { Button, Card } from '../components';
import { money } from '../format';
import { useSession } from '../session';
import { useTheme } from '../theme';

interface Favorite {
  id: string;
  merchant?: { id: string; title: string; address: string };
}

/** Профиль: «спасено еды», избранные заведения, выход (экран 9 ТЗ). */
export function ProfileScreen() {
  const theme = useTheme();
  const { me, logout } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setOrders(await api<Order[]>('/orders'));
          setFavorites(await api<Favorite[]>('/favorites'));
        } catch {
          // экран не критичен — молча оставляем пустым
        }
      })();
    }, []),
  );

  const collected = orders.filter((order) => order.status === 'collected');
  const boxesSaved = collected.reduce((sum, order) => sum + order.quantity, 0);
  const spent = collected.reduce((sum, order) => sum + order.total, 0);
  // Средний бокс — примерно 700 г еды: цифра для мотивации, не для отчётности.
  const kilograms = (boxesSaved * 0.7).toFixed(1).replace('.', ',');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        <View>
          <Text style={{ color: theme.inkFaint, fontSize: 12, letterSpacing: 1 }}>ПРОФИЛЬ</Text>
          <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '800' }}>
            {me?.name ?? me?.phone ?? ''}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: theme.ink, fontSize: 30, fontWeight: '800' }}>{boxesSaved}</Text>
            <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 4 }}>боксов спасено</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: theme.ink, fontSize: 30, fontWeight: '800' }}>{kilograms}</Text>
            <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 4 }}>килограммов еды</Text>
          </Card>
        </View>

        <Card>
          <Text style={{ color: theme.ink, fontSize: 30, fontWeight: '800' }}>{money(spent)}</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 4 }}>
            потрачено на спасённую еду
          </Text>
        </Card>

        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 12, letterSpacing: 1 }}>
            ИЗБРАННЫЕ ЗАВЕДЕНИЯ
          </Text>
          {favorites.length === 0 ? (
            <Text style={{ color: theme.inkSoft, lineHeight: 21 }}>
              Пока пусто. Добавляйте заведения в избранное — пришлём пуш, когда появится бокс.
            </Text>
          ) : (
            favorites.map((favorite) => (
              <Card key={favorite.id}>
                <Text style={{ color: theme.ink, fontWeight: '700' }}>
                  {favorite.merchant?.title ?? 'Заведение'}
                </Text>
                <Text style={{ color: theme.inkSoft, marginTop: 4 }}>
                  {favorite.merchant?.address ?? ''}
                </Text>
              </Card>
            ))
          )}
        </View>

        <Button title="Выйти" variant="ghost" onPress={() => void logout()} />
      </ScrollView>
    </SafeAreaView>
  );
}
