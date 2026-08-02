import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PixelRatio, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { BoxListItem } from '../api';
import { Notice } from '../components';
import { distance, money, pickupWindow, pluralBoxes } from '../format';
import { MAPKIT_KEY, loadYamap } from '../mapkit';
import type { RootStackParamList } from '../navigation';
import { useTheme } from '../theme';
import type { Theme } from '../theme';
import { DEFAULT_FILTERS, useNearbyBoxes } from '../useNearbyBoxes';

interface Coords {
  lat: number;
  lng: number;
}

/** Заведение и его боксы: на карте это одна булавка. */
interface Place {
  id: string;
  title: string;
  lat: number;
  lng: number;
  distanceM: number;
  boxes: BoxListItem[];
}

/** Насколько далеко надо увести карту, чтобы предложить поиск заново. */
const RESEARCH_DISTANCE_M = 700;

/**
 * Если ближайшее заведение дальше этого, карта вокруг пользователя пуста —
 * толку от неё никакого. Один раз переводим камеру на ближайшую булавку.
 */
const FAR_AWAY_M = 3_000;

/**
 * Булавки нарисованы картинкой: MapKit снимает растр с иконки, и вёрстка
 * с текстом в этот снимок попадает не всегда — цена превращалась в пустой
 * зелёный прямоугольник. Картинка рисуется одинаково всегда.
 *
 * Файл размером 96×120 px рассчитан на трёхкратную плотность, на других
 * экранах масштаб пересчитывается — иначе булавка меняет размер от телефона
 * к телефону.
 */
const PIN = require('../../assets/pin.png') as number;
const PIN_ACTIVE = require('../../assets/pin_active.png') as number;
const PIN_SCALE = PixelRatio.get() / 3;

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
  /** Карточка снизу появляется только после нажатия на булавку. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const map = useRef<MapHandle>(null);

  const { boxes, coords, loading, error } = useNearbyBoxes(DEFAULT_FILTERS, searchAt);

  const places = useMemo(() => groupByPlace(boxes), [boxes]);
  const selected = places.find((place) => place.id === selectedId) ?? null;

  const movedAway = cameraAt !== null && metersBetween(cameraAt, coords) > RESEARCH_DISTANCE_M;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={[]}>
      <View style={{ flex: 1 }}>
        {yamap ? (
          <YandexMap
            ref={map}
            yamap={yamap}
            theme={theme}
            places={places}
            center={coords}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCameraMove={setCameraAt}
          />
        ) : (
          <SchematicMap
            theme={theme}
            places={places}
            center={coords}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        {error && (
          <View style={{ position: 'absolute', top: insets.top + 12, left: 18, right: 18 }}>
            <Notice>{error}</Notice>
          </View>
        )}

        {!MAPKIT_KEY && !error && (
          <View style={{ position: 'absolute', top: insets.top + 12, left: 18, right: 18 }}>
            <Notice>Схема вместо карты: не задан ключ MapKit</Notice>
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
              map.current?.setCenter({ lat: coords.lat, lon: coords.lng }, 13.5);
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

      {selected && (
        <PlaceCard
          theme={theme}
          place={selected}
          onClose={() => setSelectedId(null)}
          onOpen={(boxId) => navigation.navigate('Box', { boxId })}
        />
      )}
    </SafeAreaView>
  );
}

/** Карточка заведения: появляется по нажатию на булавку, закрывается крестиком. */
function PlaceCard({
  theme,
  place,
  onClose,
  onOpen,
}: {
  theme: Theme;
  place: Place;
  onClose: () => void;
  onOpen: (boxId: string) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderTopWidth: 1,
        borderColor: theme.rule,
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.ink, fontSize: 17, fontWeight: '700' }}>{place.title}</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 2 }}>
            {distance(place.distanceM)} · {pluralBoxes(place.boxes.length)}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={theme.inkSoft} />
        </Pressable>
      </View>

      <ScrollView style={{ maxHeight: 232 }} showsVerticalScrollIndicator={false}>
        {place.boxes.map((box) => (
          <Pressable
            key={box.id}
            onPress={() => onOpen(box.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderColor: theme.rule,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                {box.title}
              </Text>
              <Text style={{ color: theme.inkSoft, fontSize: 13, marginTop: 2 }}>
                {pickupWindow(box.pickupStart, box.pickupEnd)}
              </Text>
            </View>
            <Text style={{ color: theme.green, fontSize: 19, fontWeight: '800' }}>
              {money(box.price)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.inkFaint} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

interface MapProps {
  theme: Theme;
  places: Place[];
  center: Coords;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** То, что экран умеет попросить у карты. */
interface MapHandle {
  setCenter: (point: { lat: number; lon: number }, zoom?: number) => void;
}

/** Подложка Яндекс.Карт с булавками заведений. */
const YandexMap = forwardRef<
  MapHandle,
  MapProps & {
    yamap: NonNullable<ReturnType<typeof loadYamap>>;
    onCameraMove: (coords: Coords) => void;
  }
>(function YandexMap({ yamap, theme, places, center, selectedId, onCameraMove, onSelect }, ref) {
  const { Yamap, Marker } = yamap;
  const initial = useRef({ lat: center.lat, lon: center.lng, zoom: 13.5 }).current;

  // Вокруг пользователя пусто, а ближайший бокс — в соседнем городе:
  // показываем его, иначе экран остаётся пустой картой. Делаем это один
  // раз, чтобы не выдёргивать карту у пользователя из-под пальца.
  const nearest = places[0];
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current || !nearest || nearest.distanceM <= FAR_AWAY_M) return;
    moved.current = true;
    (ref as React.RefObject<MapHandle | null>)?.current?.setCenter(
      { lat: nearest.lat, lon: nearest.lng },
      12,
    );
  }, [nearest, ref]);

  return (
    <Yamap
      ref={ref}
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
      {places.map((place) => {
        const active = place.id === selectedId;
        return (
          <Marker
            key={place.id}
            point={{ lat: place.lat, lon: place.lng }}
            anchor={{ x: 0.5, y: 1 }}
            source={active ? PIN_ACTIVE : PIN}
            scale={active ? PIN_SCALE * 1.25 : PIN_SCALE}
            zIndex={active ? 2 : 1}
            onPress={() => onSelect(place.id)}
          />
        );
      })}
    </Yamap>
  );
});

/** Запасной план местности: работает без ключа MapKit и на вебе. */
function SchematicMap({ theme, places, center, selectedId, onSelect }: MapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  /** Координаты → положение точки на плане, с равным масштабом по осям. */
  const pins = useMemo(() => {
    if (places.length === 0 || size.width === 0) return [];

    const latToM = 111_320;
    const lngToM = 111_320 * Math.cos((center.lat * Math.PI) / 180);

    const points = places.map((place) => ({
      place,
      x: (place.lng - center.lng) * lngToM,
      y: -(place.lat - center.lat) * latToM,
    }));

    const span = Math.max(...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]), 300);
    const scale = (Math.min(size.width, size.height) / 2 - 60) / span;

    return points.map((point) => ({
      place: point.place,
      left: size.width / 2 + point.x * scale,
      top: size.height / 2 + point.y * scale,
    }));
  }, [places, center, size]);

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
          key={pin.place.id}
          onPress={() => onSelect(pin.place.id)}
          // остриё булавки должно попадать ровно в точку заведения
          style={{
            position: 'absolute',
            left: pin.left,
            top: pin.top,
            transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
          }}
        >
          <PriceTag
            theme={theme}
            price={Math.min(...pin.place.boxes.map((box) => box.price))}
            active={pin.place.id === selectedId}
          />
        </Pressable>
      ))}
    </View>
  );
}

/** Ценник на схеме — здесь это обычная вёрстка, а не снимок для MapKit. */
function PriceTag({ theme, price, active }: { theme: Theme; price: number; active: boolean }) {
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
      <View style={{ width: 2, height: 7, backgroundColor: active ? theme.green : theme.rule }} />
    </View>
  );
}

/**
 * Одно заведение — одна булавка. Иначе два бокса одной пекарни встают
 * в одну точку, и вторую булавку не нажать: она под первой.
 */
function groupByPlace(boxes: BoxListItem[]): Place[] {
  const places = new Map<string, Place>();

  for (const box of boxes) {
    const place = places.get(box.merchant.id);
    if (place) {
      place.boxes.push(box);
      place.distanceM = Math.min(place.distanceM, box.distanceM);
    } else {
      places.set(box.merchant.id, {
        id: box.merchant.id,
        title: box.merchant.title,
        lat: box.merchant.lat,
        lng: box.merchant.lng,
        distanceM: box.distanceM,
        boxes: [box],
      });
    }
  }

  return [...places.values()];
}

/** Расстояние между точками по прямой, метры. */
function metersBetween(a: Coords, b: Coords): number {
  const latToM = 111_320;
  const lngToM = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dx = (a.lng - b.lng) * lngToM;
  const dy = (a.lat - b.lat) * latToM;
  return Math.hypot(dx, dy);
}
