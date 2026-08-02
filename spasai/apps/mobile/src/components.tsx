import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { BoxListItem } from './api';
import { distance, money } from './format';
import { shelfLife, useTheme } from './theme';
import type { Theme } from './theme';

/**
 * Пока у бокса нет фотографии, показываем спокойную заглушку с иконкой
 * категории — она не притворяется едой и не ломает вёрстку.
 */
const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  bakery: 'cafe-outline',
  coffee: 'cafe-outline',
  kitchen: 'restaurant-outline',
  restaurant: 'restaurant-outline',
  grocery: 'basket-outline',
};

export function Button({
  title,
  onPress,
  variant = 'solid',
  disabled,
  loading,
  icon,
  size = 'large',
}: {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost' | 'quiet';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'large' | 'small';
}) {
  const theme = useTheme();
  const solid = variant === 'solid';
  const quiet = variant === 'quiet';

  const background = solid ? theme.green : quiet ? theme.cardSunk : 'transparent';
  const foreground = solid ? '#FFFFFF' : theme.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: background,
        borderColor: variant === 'ghost' ? theme.rule : background,
        borderWidth: 1,
        borderRadius: size === 'large' ? 16 : 12,
        paddingVertical: size === 'large' ? 16 : 10,
        paddingHorizontal: size === 'large' ? 20 : 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'large' ? 19 : 16} color={foreground} />}
          <Text
            style={{
              color: foreground,
              fontSize: size === 'large' ? 16 : 14,
              fontWeight: '700',
            }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View style={[{ backgroundColor: theme.card, borderRadius: 18, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function Notice({
  children,
  tone = 'warn',
}: {
  children: ReactNode;
  tone?: 'warn' | 'good';
}) {
  const theme = useTheme();
  const good = tone === 'good';
  return (
    <View
      style={{
        backgroundColor: good ? theme.greenWash : '#FFF4E0',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <Ionicons
        name={good ? 'checkmark-circle' : 'alert-circle'}
        size={19}
        color={good ? theme.green : theme.soon}
        style={{ marginTop: 1 }}
      />
      <Text style={{ color: theme.ink, lineHeight: 20, flex: 1 }}>{children}</Text>
    </View>
  );
}

/** Плашка «сколько осталось до конца срока годности». */
export function ShelfBadge({ bestBefore, small }: { bestBefore: string; small?: boolean }) {
  const theme = useTheme();
  const life = shelfLife(bestBefore);

  return (
    <View
      style={{
        backgroundColor: theme[life.color],
        borderRadius: 999,
        paddingHorizontal: small ? 8 : 10,
        paddingVertical: small ? 3 : 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: theme.badgeInk, fontSize: small ? 11 : 12, fontWeight: '700' }}>
        {life.label}
      </Text>
    </View>
  );
}

/** Оранжевая плашка со скидкой: −57%. */
export function DiscountBadge({ percent, small }: { percent: number; small?: boolean }) {
  const theme = useTheme();
  if (percent <= 0) return null;

  return (
    <View
      style={{
        backgroundColor: theme.discount,
        borderRadius: 8,
        paddingHorizontal: small ? 6 : 8,
        paddingVertical: small ? 2 : 4,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: small ? 12 : 13, fontWeight: '700' }}>
        −{percent}%
      </Text>
    </View>
  );
}

/** Фото бокса или заглушка с иконкой категории. */
export function BoxPhoto({
  box,
  style,
  iconSize = 34,
}: {
  box: Pick<BoxListItem, 'photoUrl' | 'category'>;
  style?: object;
  iconSize?: number;
}) {
  const theme = useTheme();

  if (box.photoUrl) {
    return <Image source={{ uri: box.photoUrl }} style={style} resizeMode="cover" />;
  }

  return (
    <View style={[{ backgroundColor: theme.cardSunk, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons
        name={CATEGORY_ICON[box.category] ?? 'fast-food-outline'}
        size={iconSize}
        color={theme.inkFaint}
      />
    </View>
  );
}

/**
 * Карточка бокса в ленте: фото слева, содержимое справа,
 * плашка срока сверху, зелёная кнопка покупки снизу.
 */
export function BoxCard({
  box,
  onPress,
  onToggleFavorite,
  isFavorite,
}: {
  box: BoxListItem;
  onPress: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.95 : 1 }]}>
      <BoxPhoto box={box} style={styles.photo} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <ShelfBadge bestBefore={box.bestBefore} small />
          {onToggleFavorite && (
            <Pressable onPress={onToggleFavorite} hitSlop={10}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={21}
                color={isFavorite ? theme.urgent : theme.inkFaint}
              />
            </Pressable>
          )}
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {box.title}
        </Text>
        <Text style={styles.merchant} numberOfLines={1}>
          {box.merchant.title}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.was}>{money(box.originalPrice)}</Text>
          <Text style={styles.now}>{money(box.price)}</Text>
          <DiscountBadge percent={box.discountPercent} small />
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.distance}>
            <Ionicons name="location-outline" size={15} color={theme.inkSoft} />
            <Text style={styles.distanceText}>{distance(box.distanceM)}</Text>
          </View>

          <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.buy, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.buyText}>Купить</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      borderRadius: 18,
      overflow: 'hidden',
    },
    photo: { width: 118, alignSelf: 'stretch' },
    body: { flex: 1, padding: 12, gap: 3, minWidth: 0 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { color: theme.ink, fontSize: 16, fontWeight: '700', marginTop: 3 },
    merchant: { color: theme.inkSoft, fontSize: 13 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' },
    was: { color: theme.inkFaint, fontSize: 14, textDecorationLine: 'line-through' },
    now: { color: theme.green, fontSize: 19, fontWeight: '800' },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 8,
    },
    distance: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    distanceText: { color: theme.inkSoft, fontSize: 13 },
    buy: {
      backgroundColor: theme.green,
      borderRadius: 12,
      paddingVertical: 9,
      paddingHorizontal: 22,
    },
    buyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  });
}
