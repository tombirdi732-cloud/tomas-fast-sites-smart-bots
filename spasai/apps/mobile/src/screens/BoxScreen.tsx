import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, api } from '../api';
import type { BoxListItem } from '../api';
import { Button, Card, Notice } from '../components';
import { bestBeforeLabel, distance, money, pickupWindow } from '../format';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  createdAt: string;
}

/** Карточка бокса: состав, аллергены, срок годности, отзывы (экран 6 ТЗ). */
export function BoxScreen({ route, navigation }: ScreenProps<'Box'>) {
  const theme = useTheme();
  const [box, setBox] = useState<BoxListItem | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api<BoxListItem>(`/boxes/${route.params.boxId}`);
        setBox(loaded);
        setReviews(await api<Review[]>(`/reviews?merchantId=${loaded.merchant.id}&limit=5`));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить бокс');
      }
    })();
  }, [route.params.boxId]);

  function openRoute() {
    if (!box) return;
    const { lat, lng } = box.merchant;
    const url = Platform.select({
      ios: `maps://?daddr=${lat},${lng}`,
      default: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(box.merchant.title)})`,
    });
    void Linking.openURL(url);
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper, padding: 18 }}>
        <Notice>{error}</Notice>
      </SafeAreaView>
    );
  }

  if (!box) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.inkSoft} />
      </View>
    );
  }

  const soldOut = box.quantityLeft === 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 24 }}>
        <View>
          <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
            {box.merchant.title}
            {box.merchant.ratingCount > 0 &&
              ` · ${box.merchant.ratingAvg.toFixed(1)} (${box.merchant.ratingCount})`}
          </Text>
          <Text style={{ color: theme.ink, fontSize: 26, fontWeight: '800', marginTop: 6 }}>
            {box.title}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ color: theme.ink, fontSize: 32, fontWeight: '800' }}>
            {money(box.price)}
          </Text>
          <Text
            style={{ color: theme.inkFaint, fontSize: 16, textDecorationLine: 'line-through' }}
          >
            {money(box.originalPrice)}
          </Text>
          <View
            style={{
              backgroundColor: theme.sticker,
              paddingHorizontal: 9,
              paddingVertical: 3,
              transform: [{ rotate: '-4deg' }],
            }}
          >
            <Text style={{ color: theme.stickerInk, fontWeight: '800' }}>
              −{box.discountPercent}%
            </Text>
          </View>
        </View>

        {box.description && (
          <Text style={{ color: theme.inkSoft, fontSize: 15, lineHeight: 22 }}>
            {box.description}
          </Text>
        )}

        <Notice tone="good">
          {bestBeforeLabel(box.bestBefore)}. Забрать нужно до {pickupWindow(box.pickupStart, box.pickupEnd).split(', ')[1]} — срок годности заканчивается позже окна выдачи.
        </Notice>

        {box.allergens.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.inkSoft, fontSize: 12, letterSpacing: 1 }}>АЛЛЕРГЕНЫ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {box.allergens.map((allergen) => (
                <View
                  key={allergen}
                  style={{
                    backgroundColor: theme.cardSunk,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: theme.inkSoft, fontSize: 13 }}>{allergen}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Card>
          <Row label="Окно выдачи" value={pickupWindow(box.pickupStart, box.pickupEnd)} />
          <Row
            label="Адрес"
            value={`${box.merchant.address} · ${distance(box.distanceM)}`}
            last
          />
        </Card>

        <Button title="Проложить маршрут" variant="ghost" onPress={openRoute} />

        {reviews.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.inkSoft, fontSize: 12, letterSpacing: 1 }}>ОТЗЫВЫ</Text>
            {reviews.map((review) => (
              <View key={review.id} style={{ gap: 4 }}>
                <Text style={{ color: theme.ink }}>{'★'.repeat(review.rating)}</Text>
                {review.comment && (
                  <Text style={{ color: theme.inkSoft, lineHeight: 20 }}>{review.comment}</Text>
                )}
                {review.reply && (
                  <Text style={{ color: theme.inkFaint, lineHeight: 20 }}>
                    Ответ заведения: {review.reply}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.card }}>
        <View
          style={{
            padding: 18,
            borderTopWidth: 1,
            borderColor: theme.rule,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.inkSoft, fontSize: 13 }}>
            {soldOut ? 'Всё разобрали' : `Осталось ${box.quantityLeft} шт.`}
          </Text>
          <Button
            title={soldOut ? 'Боксов не осталось' : `Забронировать за ${money(box.price)}`}
            disabled={soldOut}
            onPress={() => navigation.navigate('Checkout', { boxId: box.id })}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
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
