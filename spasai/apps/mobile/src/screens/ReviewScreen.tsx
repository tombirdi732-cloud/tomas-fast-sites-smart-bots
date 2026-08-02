import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ApiError, api } from '../api';
import { Button, Notice } from '../components';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

/** Отзыв после получения заказа (экран 10 ТЗ). */
export function ReviewScreen({ route, navigation }: ScreenProps<'Review'>) {
  const theme = useTheme();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/reviews', {
        method: 'POST',
        body: { orderId: route.params.orderId, rating, ...(comment ? { comment } : {}) },
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить отзыв');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 18, gap: 18 }}>
      {error && <Notice>{error}</Notice>}

      <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '800' }}>
        Как вам заказ в «{route.params.merchantTitle}»?
      </Text>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable key={value} onPress={() => setRating(value)} hitSlop={8}>
            <Text style={{ fontSize: 38, color: value <= rating ? theme.ink : theme.rule }}>★</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={{
          backgroundColor: theme.card,
          borderColor: theme.rule,
          borderWidth: 1,
          borderRadius: 12,
          padding: 14,
          minHeight: 110,
          textAlignVertical: 'top',
          color: theme.ink,
          fontSize: 15,
        }}
        multiline
        value={comment}
        onChangeText={setComment}
        placeholder="Что было в боксе? Хватило ли на ужин?"
        placeholderTextColor={theme.inkFaint}
      />

      <Button title="Отправить отзыв" onPress={() => void submit()} loading={busy} />
    </View>
  );
}
