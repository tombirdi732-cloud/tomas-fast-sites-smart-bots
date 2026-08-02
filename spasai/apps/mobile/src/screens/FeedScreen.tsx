import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api';
import type { Favorite } from '../api';
import { BoxCard, Notice } from '../components';
import type { RootStackParamList } from '../navigation';
import { useTheme } from '../theme';
import { DEFAULT_FILTERS, useNearbyBoxes } from '../useNearbyBoxes';
import type { Filters } from '../useNearbyBoxes';

const CATEGORIES: Array<{
  key: string | null;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: null, label: 'Все', icon: 'basket-outline' },
  { key: 'bakery', label: 'Выпечка', icon: 'cafe-outline' },
  { key: 'kitchen', label: 'Готовая', icon: 'restaurant-outline' },
  { key: 'coffee', label: 'Кофейни', icon: 'cafe' },
  { key: 'grocery', label: 'Продукты', icon: 'nutrition-outline' },
];

const RADIUS_OPTIONS = [1000, 3000, 10_000];

/** Главная: боксы рядом с поиском, категориями и фильтрами (экраны 3 и 5 ТЗ). */
export function FeedScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);

  const { boxes, loading, error, usingFallback, reload } = useNearbyBoxes(filters);

  const loadFavorites = useCallback(async () => {
    try {
      const list = await api<Favorite[]>('/favorites');
      setFavorites(new Set(list.map((item) => item.merchantId)));
    } catch {
      // избранное не критично для ленты
    }

    try {
      const news = await api<unknown[]>('/notifications?unreadOnly=true');
      setUnread(news.length);
    } catch {
      // и уведомления тоже
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFavorites();
    }, [loadFavorites]),
  );

  async function toggleFavorite(merchantId: string) {
    const next = new Set(favorites);
    const wasFavorite = next.has(merchantId);
    if (wasFavorite) next.delete(merchantId);
    else next.add(merchantId);
    setFavorites(next);

    try {
      if (wasFavorite) {
        await api(`/favorites/${merchantId}`, { method: 'DELETE' });
      } else {
        await api('/favorites', { method: 'POST', body: { merchantId } });
      }
    } catch {
      void loadFavorites(); // не получилось — возвращаем как было
    }
  }

  const visible = query.trim()
    ? boxes.filter((box) => {
        const needle = query.trim().toLowerCase();
        return (
          box.title.toLowerCase().includes(needle) ||
          box.merchant.title.toLowerCase().includes(needle)
        );
      })
    : boxes;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      {/* шапка */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="location" size={20} color={theme.green} />
            <Text style={{ color: theme.ink, fontSize: 18, fontWeight: '700' }}>
              {usingFallback ? 'Москва' : 'Рядом с вами'}
            </Text>
          </View>

          <Pressable hitSlop={8} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={23} color={theme.ink} />
            {unread > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -1,
                  right: -1,
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: theme.urgent,
                  borderWidth: 1.5,
                  borderColor: theme.bg,
                }}
              />
            )}
          </Pressable>
        </View>

        {/* поиск и фильтры */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: theme.card,
              borderRadius: 14,
              paddingHorizontal: 14,
              height: 46,
            }}
          >
            <Ionicons name="search" size={18} color={theme.inkSoft} />
            <TextInput
              style={{ flex: 1, color: theme.ink, fontSize: 15 }}
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск боксов и заведений"
              placeholderTextColor={theme.inkFaint}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.inkFaint} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setFiltersOpen((open) => !open)}
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: filtersOpen ? theme.green : theme.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="options-outline" size={21} color={filtersOpen ? '#FFF' : theme.green} />
          </Pressable>
        </View>

        {/* категории */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, paddingVertical: 2 }}
        >
          {CATEGORIES.map((category) => {
            const active = filters.category === category.key;
            return (
              <Pressable
                key={category.label}
                onPress={() => setFilters((f) => ({ ...f, category: category.key }))}
                style={{ alignItems: 'center', gap: 6, width: 74 }}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: active ? theme.green : theme.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={category.icon}
                    size={25}
                    color={active ? '#FFFFFF' : theme.inkSoft}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? theme.green : theme.inkSoft,
                    fontSize: 12,
                    fontWeight: active ? '700' : '400',
                  }}
                >
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtersOpen && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {RADIUS_OPTIONS.map((radius) => {
              const active = filters.radius === radius;
              return (
                <Pressable
                  key={radius}
                  onPress={() => setFilters((f) => ({ ...f, radius }))}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? theme.green : theme.card,
                  }}
                >
                  <Text style={{ color: active ? '#FFF' : theme.inkSoft, fontSize: 13 }}>
                    до {radius / 1000} км
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() =>
                setFilters((f) => ({ ...f, maxPrice: f.maxPrice === 30_000 ? null : 30_000 }))
              }
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: filters.maxPrice === 30_000 ? theme.green : theme.card,
              }}
            >
              <Text
                style={{
                  color: filters.maxPrice === 30_000 ? '#FFF' : theme.inkSoft,
                  fontSize: 13,
                }}
              >
                до 300 ₽
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(box) => box.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.inkSoft} />
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {error && <Notice>{error}</Notice>}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: theme.ink, fontSize: 18, fontWeight: '700' }}>
                Рядом с вами
              </Text>
              <Pressable
                onPress={() => navigation.navigate('Tabs', { screen: 'Карта' })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                hitSlop={8}
              >
                <Text style={{ color: theme.green, fontSize: 14, fontWeight: '600' }}>
                  Смотреть на карте
                </Text>
                <Ionicons name="chevron-forward" size={15} color={theme.green} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
              <Ionicons name="basket-outline" size={40} color={theme.inkFaint} />
              <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 22 }}>
                {query
                  ? 'Ничего не нашлось. Попробуйте другой запрос.'
                  : 'Рядом пока пусто. Увеличьте радиус или загляните ближе к вечеру — заведения выставляют боксы перед закрытием.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <BoxCard
            box={item}
            isFavorite={favorites.has(item.merchant.id)}
            onToggleFavorite={() => void toggleFavorite(item.merchant.id)}
            onPress={() => navigation.navigate('Box', { boxId: item.id })}
          />
        )}
      />
    </SafeAreaView>
  );
}
