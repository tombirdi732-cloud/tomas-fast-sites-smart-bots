import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api';
import type { Favorite } from '../api';
import { Notice } from '../components';
import { useTheme } from '../theme';

/** Избранные заведения: сюда приходят пуши о новых боксах (раздел 7.9 ТЗ). */
export function FavoritesScreen() {
  const theme = useTheme();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFavorites(await api<Favorite[]>('/favorites'));
      setError(null);
    } catch {
      setError('Не удалось загрузить избранное');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function remove(merchantId: string) {
    setFavorites((list) => list.filter((item) => item.merchantId !== merchantId));
    try {
      await api(`/favorites/${merchantId}`, { method: 'DELETE' });
    } catch {
      void load();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '800' }}>Избранное</Text>
      </View>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.inkSoft} />
        }
        ListHeaderComponent={error ? <Notice>{error}</Notice> : null}
        ListEmptyComponent={
          loading ? null : (
            <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
              <Ionicons name="heart-outline" size={40} color={theme.inkFaint} />
              <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 22 }}>
                Пока пусто. Добавляйте заведения сердечком в ленте — пришлём уведомление, когда у
                них появится бокс.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 18,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: theme.greenWash,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="storefront-outline" size={22} color={theme.green} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '700' }}>
                {item.merchant?.title ?? 'Заведение'}
              </Text>
              <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 2 }}>
                {item.merchant?.address ?? ''}
              </Text>
            </View>

            <Pressable onPress={() => void remove(item.merchantId)} hitSlop={10}>
              <Ionicons name="heart" size={22} color={theme.urgent} />
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
