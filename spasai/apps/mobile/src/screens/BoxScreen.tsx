import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ApiError, api } from '../api';
import type { BoxListItem, Favorite, Review } from '../api';
import { BoxPhoto, Button, DiscountBadge, Notice, ShelfBadge } from '../components';
import { bestBeforeLabel, distance, money, pickupWindow, time } from '../format';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

/** Карточка бокса: фото, цены, срок годности, адрес, отзывы (экран 6 ТЗ). */
export function BoxScreen({ route, navigation }: ScreenProps<'Box'>) {
  const theme = useTheme();
  const [box, setBox] = useState<BoxListItem | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api<BoxListItem>(`/boxes/${route.params.boxId}`);
        setBox(loaded);
        setReviews(await api<Review[]>(`/reviews?merchantId=${loaded.merchant.id}&limit=5`));

        const favorites = await api<Favorite[]>('/favorites').catch(() => []);
        setIsFavorite(favorites.some((item) => item.merchantId === loaded.merchant.id));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить бокс');
      }
    })();
  }, [route.params.boxId]);

  async function toggleFavorite() {
    if (!box) return;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      if (next) await api('/favorites', { method: 'POST', body: { merchantId: box.merchant.id } });
      else await api(`/favorites/${box.merchant.id}`, { method: 'DELETE' });
    } catch {
      setIsFavorite(!next);
    }
  }

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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
        <Notice>{error}</Notice>
      </SafeAreaView>
    );
  }

  if (!box) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.green} />
      </View>
    );
  }

  const soldOut = box.quantityLeft === 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {/* фото и кнопки поверх него */}
        <View>
          <BoxPhoto box={box} style={{ width: '100%', height: 300 }} iconSize={64} />

          <SafeAreaView
            edges={['top']}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingTop: 8,
              }}
            >
              <RoundButton icon="chevron-back" onPress={() => navigation.goBack()} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <RoundButton
                  icon={isFavorite ? 'heart' : 'heart-outline'}
                  tint={isFavorite ? theme.urgent : undefined}
                  onPress={() => void toggleFavorite()}
                />
                <RoundButton
                  icon="share-outline"
                  onPress={() =>
                    void Share.share({
                      message: `«${box.title}» в «${box.merchant.title}» за ${money(box.price)} — Спасай`,
                    })
                  }
                />
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* шторка с содержимым */}
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            marginTop: -24,
            paddingTop: 12,
            paddingHorizontal: 18,
            paddingBottom: 18,
            gap: 14,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.rule,
            }}
          />

          <Text style={{ color: theme.ink, fontSize: 26, fontWeight: '800', lineHeight: 32 }}>
            {box.title}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="storefront-outline" size={16} color={theme.inkSoft} />
              <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>
                {box.merchant.title}
              </Text>
            </View>

            {box.merchant.ratingCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={15} color={theme.star} />
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '700' }}>
                  {box.merchant.ratingAvg.toFixed(1)}
                </Text>
                <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
                  ({box.merchant.ratingCount})
                </Text>
              </View>
            )}
          </View>

          {/* срок годности — обязательно до покупки */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: theme.bg,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <ShelfBadge bestBefore={box.bestBefore} />
            <Text style={{ color: theme.inkSoft, fontSize: 14, flex: 1 }}>
              До окончания срока годности
            </Text>
          </View>

          {/* цены */}
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Обычная цена</Text>
              <Text
                style={{
                  color: theme.inkFaint,
                  fontSize: 21,
                  fontWeight: '600',
                  textDecorationLine: 'line-through',
                }}
              >
                {money(box.originalPrice)}
              </Text>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Цена со скидкой</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: theme.green, fontSize: 26, fontWeight: '800' }}>
                  {money(box.price)}
                </Text>
                <DiscountBadge percent={box.discountPercent} />
              </View>
            </View>
          </View>

          {box.description && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '700' }}>Описание</Text>
              <Text
                numberOfLines={expanded ? undefined : 2}
                style={{ color: theme.inkSoft, fontSize: 15, lineHeight: 22 }}
              >
                {box.description}
              </Text>
              <Pressable onPress={() => setExpanded((value) => !value)} hitSlop={8}>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.inkSoft}
                  style={{ alignSelf: 'center' }}
                />
              </Pressable>
            </View>
          )}

          {box.allergens.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '700' }}>Аллергены</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {box.allergens.map((allergen) => (
                  <View
                    key={allergen}
                    style={{
                      backgroundColor: theme.bg,
                      paddingHorizontal: 11,
                      paddingVertical: 6,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: theme.inkSoft, fontSize: 13 }}>{allergen}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* доступно и самовывоз */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.bg,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}>
              <Ionicons name="cube-outline" size={20} color={theme.green} />
              <View>
                <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Доступно</Text>
                <Text style={{ color: theme.green, fontSize: 17, fontWeight: '700' }}>
                  {box.quantityLeft} шт.
                </Text>
              </View>
            </View>

            <View style={{ width: 1, backgroundColor: theme.rule, marginHorizontal: 12 }} />

            <Pressable style={{ flex: 1.3, flexDirection: 'row', gap: 10 }} onPress={openRoute}>
              <Ionicons name="walk-outline" size={20} color={theme.green} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Самовывоз</Text>
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>
                  {box.merchant.address}
                </Text>
                <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 2 }}>
                  {distance(box.distanceM)} · {pickupWindow(box.pickupStart, box.pickupEnd)}
                </Text>
              </View>
            </Pressable>
          </View>

          <Notice tone="good">
            {bestBeforeLabel(box.bestBefore)}. Забрать нужно до {time(box.pickupEnd)} — срок
            годности заканчивается позже окна выдачи.
          </Notice>

          {reviews.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '700' }}>Отзывы</Text>
              {reviews.map((review) => (
                <View key={review.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Ionicons
                        key={value}
                        name={value <= review.rating ? 'star' : 'star-outline'}
                        size={14}
                        color={value <= review.rating ? theme.star : theme.inkFaint}
                      />
                    ))}
                  </View>
                  {review.comment && (
                    <Text style={{ color: theme.inkSoft, lineHeight: 20 }}>{review.comment}</Text>
                  )}
                  {review.reply && (
                    <Text style={{ color: theme.inkFaint, lineHeight: 20, fontSize: 13 }}>
                      Ответ заведения: {review.reply}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* кнопка брони */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.card }}>
        <View style={{ padding: 16, paddingTop: 12 }}>
          <Button
            title={soldOut ? 'Боксов не осталось' : `Забронировать за ${money(box.price)}`}
            icon={soldOut ? undefined : 'lock-closed'}
            disabled={soldOut}
            onPress={() => navigation.navigate('Checkout', { boxId: box.id })}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({
  icon,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.card,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icon} size={21} color={tint ?? theme.ink} />
    </Pressable>
  );
}
