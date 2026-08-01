import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import type { BoxListItem } from './api';
import { bestBeforeLabel, distance, money, pickupWindow } from './format';
import { useTheme } from './theme';
import type { Theme } from './theme';

/** Цветная подложка вместо фото: у боксов на старте картинок нет. */
const SHELF_COLORS: Record<string, [string, string]> = {
  bakery: ['#C98A3F', '#8A4F21'],
  coffee: ['#7D6A5B', '#3F3229'],
  kitchen: ['#6F7F4A', '#38452A'],
  restaurant: ['#8A5A4A', '#472B23'],
  grocery: ['#4F7A72', '#24413D'],
};

const CATEGORY_WORD: Record<string, string> = {
  bakery: 'ВЫПЕЧКА',
  coffee: 'КОФЕЙНЯ',
  kitchen: 'КУЛИНАРИЯ',
  restaurant: 'КУХНЯ',
  grocery: 'ПРОДУКТЫ',
};

export function Button({
  title,
  onPress,
  variant = 'solid',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();
  const ghost = variant === 'ghost';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: ghost ? 'transparent' : theme.ink,
          borderColor: ghost ? theme.rule : theme.ink,
          borderWidth: 1,
          borderRadius: 14,
          paddingVertical: 15,
          alignItems: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ghost ? theme.ink : theme.paper} />
      ) : (
        <Text
          style={{
            color: ghost ? theme.ink : theme.paper,
            fontSize: 16,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderColor: theme.rule,
          borderWidth: 1,
          borderRadius: 16,
          padding: 16,
        },
        style,
      ]}
    >
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
        backgroundColor: good ? theme.greenWash : theme.emberWash,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Text style={{ color: theme.ink, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

/** Карточка бокса в ленте. */
export function BoxCard({ box, onPress }: { box: BoxListItem; onPress: () => void }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const colors = SHELF_COLORS[box.category] ?? SHELF_COLORS.bakery!;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}>
      <View style={[styles.shelf, { backgroundColor: colors[1] }]}>
        <View style={[styles.shelfTint, { backgroundColor: colors[0] }]} />
        <Text style={styles.shelfWord}>{CATEGORY_WORD[box.category] ?? 'БОКС'}</Text>

        <View style={styles.sticker}>
          <Text style={styles.stickerText}>−{box.discountPercent}%</Text>
        </View>

        <View style={styles.left}>
          <Text style={styles.leftText}>Осталось {box.quantityLeft}</Text>
        </View>
      </View>

      <View style={{ padding: 14, gap: 7 }}>
        <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
          <Text style={styles.merchant} numberOfLines={1}>
            {box.merchant.title}
          </Text>
          {box.merchant.ratingCount > 0 && (
            <Text style={styles.rating}>{box.merchant.ratingAvg.toFixed(1)}</Text>
          )}
        </View>

        <Text style={styles.title}>{box.title}</Text>

        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Text style={styles.meta}>{distance(box.distanceM)}</Text>
          <Text style={styles.meta}>{bestBeforeLabel(box.bestBefore)}</Text>
        </View>

        <View style={styles.foot}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={styles.price}>{money(box.price)}</Text>
            <Text style={styles.was}>{money(box.originalPrice)}</Text>
          </View>
          <Text style={styles.window}>{pickupWindow(box.pickupStart, box.pickupEnd)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.card,
      borderColor: theme.rule,
      borderWidth: 1,
      borderRadius: 18,
      overflow: 'hidden',
    },
    shelf: { aspectRatio: 16 / 9, justifyContent: 'center', alignItems: 'center' },
    shelfTint: { ...StyleSheet.absoluteFillObject, opacity: 0.55 },
    shelfWord: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 34,
      fontWeight: '800',
      letterSpacing: 2,
    },
    sticker: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: theme.sticker,
      paddingHorizontal: 10,
      paddingVertical: 4,
      transform: [{ rotate: '-6deg' }],
    },
    stickerText: { color: theme.stickerInk, fontWeight: '800', fontSize: 16 },
    left: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      backgroundColor: 'rgba(20,20,16,0.74)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    leftText: { color: '#fff', fontSize: 12, fontWeight: '500' },
    merchant: { color: theme.inkSoft, fontSize: 13, flexShrink: 1 },
    rating: { color: theme.ink, fontSize: 13, fontWeight: '700' },
    title: { color: theme.ink, fontSize: 16, fontWeight: '700', lineHeight: 21 },
    meta: { color: theme.inkSoft, fontSize: 13 },
    foot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 10,
      marginTop: 2,
    },
    price: { color: theme.ink, fontSize: 26, fontWeight: '800' },
    was: { color: theme.inkFaint, fontSize: 14, textDecorationLine: 'line-through' },
    window: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  });
}
