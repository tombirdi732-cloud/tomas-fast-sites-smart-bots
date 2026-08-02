import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { BoxListItem } from '../api';
import { Button, Notice } from '../components';
import { distance, money, pickupWindow } from '../format';
import { MAPKIT_KEY, loadYamap } from '../mapkit';
import type { RootStackParamList } from '../navigation';
import { useTheme } from '../theme';
import type { Theme } from '../theme';
import { DEFAULT_FILTERS, useNearbyBoxes } from '../useNearbyBoxes';

interface Coords {
  lat: number;
  lng: number;
}

/** Насколько далеко надо увести карту, чтобы предложить поиск заново. */
const RESEARCH_DISTANCE_M = 700;

/**
 * Боксы на карте с карточкой снизу (экран 4 ТЗ).
 *
 * Подложка — Яндекс.Карты (MapKit), ключ задаётся переменной
 * `EXPO_PUBLIC_MAPKIT_API_KEY`. Пока ключа нет, экран рисует схему:
 * точки раскладываются по координатам относительно пользователя,
 * с сохранением взаимного расположения и масштаба.
 */
export function MapScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const yamap = useMemo(() => loadYamap(), []);
  // Карта идёт во весь экран, под статус-бар — как во всех картах.
  // Плавающие элементы отступают от него сами.
  const insets = useSafeAreaInsets();

  /** Куда увели карту. null — ищем вокруг пользователя. */
  const [searchAt, setSearchAt] = useState<Coords | null>(null);
  const [cameraAt, setCameraAt] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { boxes, coords, loading, error } = useNearbyBoxes(DEFAULT_FILTERS, searchAt);

  const movedAway =
    cameraAt !== null && metersBetween(cameraAt, coords) > RESEARCH_DISTANCE_M;

  const selected: BoxListItem | undefined =
    boxes.find((box) => box.id === selectedId) ?? boxes[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={[]}>
      <View style={{ flex: 1 }}>
        {yamap ? (
          <YandexMap
            yamap={yamap}
            theme={theme}
            boxes={boxes}
            center={coords}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onCameraMove={setCameraAt}
          />
        ) : (
          <SchematicMap
            theme={theme}
            boxes={boxes}
            center={coords}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        )}

        {error && (
          <View
            style={{
              position: 'absolute',
              top: insets.top + 12,
              left: 18,
              right: 18,
            }}
          >
            <Notice>{error}</Notice>
          </View>
        )}

        {loading && (
          <View style={{ position: 'absolute', top: insets.top + 14, alignSelf: 'center' }}>
            <ActivityIndicator color={theme.green} />
          </View>
        )}

        {/* Карту увели в сторону — предлагаем поискать там */}
        {movedAway && !loading && (
          <Pressable
            onPress={() => setSearchAt(cameraAt)}
            style={{
              position: 'absolute',
              top: insets.top + 14,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              backgroundColor: theme.card,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 10,
              shadowColor: '#000',
              shadowOpacity: 0.14,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }}
          >
            <Ionicons name="refresh" size={15} color={theme.green} />
            <Text style={{ color: theme.ink, fontWeight: '700' }}>Искать здесь</Text>
          </Pressable>
        )}

        {/* Вернуться к своему местоположению */}
        {searchAt !== null && (
          <Pressable
            onPress={() => {
              setSearchAt(null);
              setCameraAt(null);
            }}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.card,
              shadowColor: '#000',
              shadowOpacity: 0.14,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }}
          >
            <Ionicons name="locate" size={21} color={theme.green} />
          </Pressable>
        )}
      </View>

      {!MAPKIT_KEY && (
        <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
          <Notice>Схема вместо карты: не задан ключ MapKit</Notice>
        </View>
      )}


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
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
          >
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

interface MapProps {
  theme: Theme;
  boxes: BoxListItem[];
  center: Coords;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Подложка Яндекс.Карт с ценниками вместо булавок. */
function YandexMap({
  yamap,
  theme,
  boxes,
  center,
  selectedId,
  onCameraMove,
  onSelect,
}: MapProps & {
  yamap: NonNullable<ReturnType<typeof loadYamap>>;
  onCameraMove: (coords: Coords) => void;
}) {
  const { Yamap, Marker } = yamap;
  const initial = useRef({ lat: center.lat, lon: center.lng, zoom: 13.5 }).current;

  return (
    <Yamap
      style={{ flex: 1 }}
      initialRegion={initial}
      showUserPosition
      nightMode={theme.dark}
      logoPadding={{ horizontal: 12, vertical: 12 }}
      onCameraPositionChangeEnd={(event: {
        nativeEvent: { point: { lat: number; lon: number } };
      }) => {
        const { lat, lon } = event.nativeEvent.point;
        onCameraMove({ lat, lng: lon });
      }}
    >
      {boxes.map((box) => (
        <Marker
          key={box.id}
          point={{ lat: box.merchant.lat, lon: box.merchant.lng }}
          anchor={{ x: 0.5, y: 1 }}
          onPress={() => onSelect(box.id)}
        >
          <PriceTag theme={theme} price={box.price} active={box.id === selectedId} />
        </Marker>
      ))}
    </Yamap>
  );
}

/**
 * Ценник на карте. MapKit снимает с этой вьюхи растр, поэтому здесь
 * только простые элементы — тени и изображения в снимок не попадают.
 */
function PriceTag({
  theme,
  price,
  active,
}: {
  theme: Theme;
  price: number;
  active: boolean;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: active ? theme.green : theme.rule,
          backgroundColor: active ? theme.green : theme.card,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: active ? '#FFFFFF' : theme.ink, fontWeight: '700', fontSize: 13 }}
        >
          {money(price)}
        </Text>
      </View>
      {/* хвостик, указывающий на точку */}
      <View
        style={{
          width: 2,
          height: 7,
          backgroundColor: active ? theme.green : theme.rule,
        }}
      />
    </View>
  );
}

/** Запасной план местности: работает без ключа MapKit и на вебе. */
function SchematicMap({ theme, boxes, center, selectedId, onSelect }: MapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  /** Координаты → положение точки на плане, с равным масштабом по осям. */
  const pins = useMemo(() => {
    if (boxes.length === 0 || size.width === 0) return [];

    const latToM = 111_320;
    const lngToM = 111_320 * Math.cos((center.lat * Math.PI) / 180);

    const points = boxes.map((box) => ({
      box,
      x: (box.merchant.lng - center.lng) * lngToM,
      y: -(box.merchant.lat - center.lat) * latToM,
    }));

    const span = Math.max(...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]), 300);
    const scale = (Math.min(size.width, size.height) / 2 - 60) / span;

    return points.map((point) => ({
      box: point.box,
      left: size.width / 2 + point.x * scale,
      top: size.height / 2 + point.y * scale,
    }));
  }, [boxes, center, size]);

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.cardSunk }}
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

      {pins.map((pin) => (
        <Pressable
          key={pin.box.id}
          onPress={() => onSelect(pin.box.id)}
          // хвостик ценника должен попадать ровно в точку заведения
          style={{
            position: 'absolute',
            left: pin.left,
            top: pin.top,
            transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
          }}
        >
          <PriceTag theme={theme} price={pin.box.price} active={pin.box.id === selectedId} />
        </Pressable>
      ))}
    </View>
  );
}

/** Расстояние между точками по прямой, метры. */
function metersBetween(a: Coords, b: Coords): number {
  const latToM = 111_320;
  const lngToM = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dx = (a.lng - b.lng) * lngToM;
  const dy = (a.lat - b.lat) * latToM;
  return Math.hypot(dx, dy);
}
