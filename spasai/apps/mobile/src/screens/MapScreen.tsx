import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { BoxListItem } from '../api';
import { Button, Notice } from '../components';
import { distance, money, pickupWindow } from '../format';
import type { RootStackParamList } from '../navigation';
import { useTheme } from '../theme';
import { DEFAULT_FILTERS, useNearbyBoxes } from '../useNearbyBoxes';

/**
 * Боксы на плане местности с боттом-шитом (экран 4 ТЗ).
 *
 * Подложка Яндекс.Карт (MapKit) подключается ключом разработчика — пока его
 * нет, точки раскладываются по координатам относительно пользователя,
 * с сохранением взаимного расположения и масштаба.
 */
export function MapScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { boxes, coords, loading, error } = useNearbyBoxes(DEFAULT_FILTERS);

  const [size, setSize] = useState({ width: 0, height: 0 });

  /** Координаты → положение точки на плане, с равным масштабом по осям. */
  const pins = useMemo(() => {
    if (boxes.length === 0 || size.width === 0) return [];

    const latToM = 111_320;
    const lngToM = 111_320 * Math.cos((coords.lat * Math.PI) / 180);

    const points = boxes.map((box) => ({
      box,
      x: (box.merchant.lng - coords.lng) * lngToM,
      y: -(box.merchant.lat - coords.lat) * latToM,
    }));

    const span = Math.max(
      ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]),
      300,
    );
    const scale = (Math.min(size.width, size.height) / 2 - 44) / span;

    return points.map((point) => ({
      box: point.box,
      left: size.width / 2 + point.x * scale,
      top: size.height / 2 + point.y * scale,
    }));
  }, [boxes, coords, size]);

  const selected: BoxListItem | undefined =
    boxes.find((box) => box.id === selectedId) ?? boxes[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper }} edges={['top']}>
      <View style={{ padding: 18, paddingBottom: 10 }}>
        <Text style={{ color: theme.inkFaint, fontSize: 12, letterSpacing: 1 }}>РАДИУС 3 КМ</Text>
        <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '800' }}>
          {loading ? 'Ищем…' : `${boxes.length} боксов рядом`}
        </Text>
      </View>

      {error && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Notice>{error}</Notice>
        </View>
      )}

      <View
        style={{ flex: 1, backgroundColor: theme.cardSunk, marginHorizontal: 0 }}
        onLayout={(event) => setSize(event.nativeEvent.layout)}
      >
        {/* сетка кварталов */}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <View
            key={`h${fraction}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: size.height * fraction,
              height: 1,
              backgroundColor: theme.rule,
            }}
          />
        ))}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <View
            key={`v${fraction}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: size.width * fraction,
              width: 1,
              backgroundColor: theme.rule,
            }}
          />
        ))}

        {/* пользователь */}
        <View
          style={{
            position: 'absolute',
            left: size.width / 2 - 8,
            top: size.height / 2 - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.green,
            borderWidth: 3,
            borderColor: theme.card,
          }}
        />

        {pins.map((pin) => {
          const active = pin.box.id === (selected?.id ?? '');
          return (
            <Pressable
              key={pin.box.id}
              onPress={() => setSelectedId(pin.box.id)}
              style={{
                position: 'absolute',
                left: pin.left - 34,
                top: pin.top - 16,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? theme.sticker : theme.ink,
                backgroundColor: active ? theme.sticker : theme.card,
              }}
            >
              <Text style={{ color: active ? theme.stickerInk : theme.ink, fontWeight: '700' }}>
                {money(pin.box.price)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected && (
        <View
          style={{
            backgroundColor: theme.card,
            borderTopWidth: 1,
            borderColor: theme.rule,
            padding: 18,
            gap: 10,
          }}
        >
          <Text style={{ color: theme.inkSoft, fontSize: 13 }}>
            {selected.merchant.title} · {distance(selected.distanceM)}
          </Text>
          <Text style={{ color: theme.ink, fontSize: 17, fontWeight: '700' }}>{selected.title}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ color: theme.ink, fontSize: 24, fontWeight: '800' }}>
              {money(selected.price)}
            </Text>
            <Text style={{ color: theme.ink, fontWeight: '600' }}>
              {pickupWindow(selected.pickupStart, selected.pickupEnd)}
            </Text>
          </View>
          <Button
            title="Открыть бокс"
            onPress={() => navigation.navigate('Box', { boxId: selected.id })}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
