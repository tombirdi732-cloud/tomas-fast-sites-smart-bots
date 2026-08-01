import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { Button } from '../components';
import { useSession } from '../session';
import { useTheme } from '../theme';

const SLIDES = [
  {
    word: 'ВЕЧЕР',
    title: 'Еда, которая иначе пропадёт',
    text: 'Пекарни, кофейни и кулинарии перед закрытием собирают боксы из того, что не разобрали за день. Срок годности ещё не истёк — иначе продавать нельзя.',
  },
  {
    word: '−70%',
    title: 'Дешевле в два-три раза',
    text: 'Бокс за 299 ₽ вместо 900 ₽. Что внутри — сюрприз: зависит от того, что осталось на витрине к вечеру.',
  },
  {
    word: 'РЯДОМ',
    title: 'Покажем, что рядом с вами',
    text: 'Разрешите доступ к геолокации — увидите боксы в пешей доступности и расстояние до каждого.',
  },
] as const;

/** Онбординг из трёх экранов, последний просит геолокацию (экран 1 ТЗ). */
export function OnboardingScreen() {
  const theme = useTheme();
  const { finishOnboarding } = useSession();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index]!;
  const last = index === SLIDES.length - 1;

  async function next() {
    if (!last) {
      setIndex((value) => value + 1);
      return;
    }
    // Отказ от геолокации не блокирует вход: адрес можно ввести позже.
    await Location.requestForegroundPermissionsAsync().catch(() => null);
    finishOnboarding();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper }}>
      <View style={{ flex: 1, padding: 24, gap: 28, justifyContent: 'center' }}>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: theme.sticker,
            paddingHorizontal: 14,
            paddingVertical: 6,
            transform: [{ rotate: '-4deg' }],
          }}
        >
          <Text style={{ color: theme.stickerInk, fontSize: 30, fontWeight: '800', letterSpacing: 1 }}>
            {slide.word}
          </Text>
        </View>

        <Text style={{ color: theme.ink, fontSize: 30, fontWeight: '800', lineHeight: 36 }}>
          {slide.title}
        </Text>

        <Text style={{ color: theme.inkSoft, fontSize: 16, lineHeight: 24 }}>{slide.text}</Text>
      </View>

      <View style={{ padding: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {SLIDES.map((item, i) => (
            <View
              key={item.word}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? theme.ink : theme.rule,
              }}
            />
          ))}
        </View>

        <Button
          title={last ? 'Разрешить геолокацию' : 'Дальше'}
          onPress={() => void next()}
        />

        {last && (
          <Button title="Позже" variant="ghost" onPress={finishOnboarding} />
        )}
      </View>
    </SafeAreaView>
  );
}
