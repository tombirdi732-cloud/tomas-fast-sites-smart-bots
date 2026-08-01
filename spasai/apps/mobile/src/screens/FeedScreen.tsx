import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BoxCard, Notice } from '../components';
import type { RootStackParamList } from '../navigation';
import { useTheme } from '../theme';
import { DEFAULT_FILTERS, useNearbyBoxes } from '../useNearbyBoxes';
import type { Filters } from '../useNearbyBoxes';

const CHIPS: Array<{ label: string; apply: (f: Filters) => Filters; active: (f: Filters) => boolean }> = [
  {
    label: 'Всё рядом',
    apply: () => DEFAULT_FILTERS,
    active: (f) => f.category === null && f.maxPrice === null && !f.favoritesOnly,
  },
  {
    label: 'До 300 ₽',
    apply: (f) => ({ ...f, maxPrice: f.maxPrice === 30_000 ? null : 30_000 }),
    active: (f) => f.maxPrice === 30_000,
  },
  {
    label: 'Выпечка',
    apply: (f) => ({ ...f, category: f.category === 'bakery' ? null : 'bakery' }),
    active: (f) => f.category === 'bakery',
  },
  {
    label: 'Кофейни',
    apply: (f) => ({ ...f, category: f.category === 'coffee' ? null : 'coffee' }),
    active: (f) => f.category === 'coffee',
  },
  {
    label: 'Избранные',
    apply: (f) => ({ ...f, favoritesOnly: !f.favoritesOnly }),
    active: (f) => f.favoritesOnly,
  },
];

const RADIUS_OPTIONS = [1000, 3000, 10_000];

/** Лента боксов рядом с фильтрами (экраны 3 и 5 ТЗ). */
export function FeedScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const { boxes, loading, error, usingFallback, reload } = useNearbyBoxes(filters);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper }} edges={['top']}>
      <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 12 }}>
        <View>
          <Text style={{ color: theme.inkFaint, fontSize: 12, letterSpacing: 1 }}>
            {usingFallback ? 'ГЕОЛОКАЦИЯ ВЫКЛЮЧЕНА · ЦЕНТР МОСКВЫ' : 'ИЩЕМ РЯДОМ С ВАМИ'}
          </Text>
          <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '800' }}>
            {loading ? 'Ищем боксы…' : `${boxes.length} боксов рядом`}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CHIPS.map((chip) => {
            const active = chip.active(filters);
            return (
              <Pressable
                key={chip.label}
                onPress={() => setFilters(chip.apply)}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.rule,
                  backgroundColor: active ? theme.ink : 'transparent',
                }}
              >
                <Text style={{ color: active ? theme.paper : theme.inkSoft, fontWeight: active ? '700' : '400' }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}

          {RADIUS_OPTIONS.map((radius) => {
            const active = filters.radius === radius;
            return (
              <Pressable
                key={radius}
                onPress={() => setFilters((f) => ({ ...f, radius }))}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.rule,
                  backgroundColor: active ? theme.ink : 'transparent',
                }}
              >
                <Text style={{ color: active ? theme.paper : theme.inkSoft }}>
                  {radius >= 1000 ? `${radius / 1000} км` : `${radius} м`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={boxes}
        keyExtractor={(box) => box.id}
        contentContainerStyle={{ padding: 18, paddingTop: 0, gap: 14, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.inkSoft} />}
        ListHeaderComponent={error ? <Notice>{error}</Notice> : null}
        ListEmptyComponent={
          loading ? null : (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 22 }}>
                Рядом пока пусто. Попробуйте увеличить радиус или загляните ближе к вечеру —
                заведения выставляют боксы перед закрытием.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <BoxCard box={item} onPress={() => navigation.navigate('Box', { boxId: item.id })} />
        )}
      />
    </SafeAreaView>
  );
}
