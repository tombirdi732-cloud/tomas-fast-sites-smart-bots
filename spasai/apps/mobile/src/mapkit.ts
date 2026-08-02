import Constants from 'expo-constants';

/**
 * Подключение Яндекс.Карт (MapKit).
 *
 * Ключ живёт в переменной окружения `EXPO_PUBLIC_MAPKIT_API_KEY` — Metro
 * подставляет её в бандл на сборке, поэтому в репозиторий она не попадает.
 * Запасной вариант — `extra.mapkitApiKey` в app.json.
 *
 * Без ключа карта не падает, а показывает схему: точки раскладываются по
 * координатам относительно пользователя. Приложение остаётся рабочим и до
 * получения ключа.
 *
 * Веб обслуживает `mapkit.web.ts` — там нативного пакета нет вовсе.
 */

const fromEnv = process.env.EXPO_PUBLIC_MAPKIT_API_KEY;
const fromConfig = Constants.expoConfig?.extra?.mapkitApiKey as string | undefined;

export const MAPKIT_KEY: string | null = (fromEnv ?? fromConfig)?.trim() || null;

interface Yamap {
  Yamap: React.ComponentType<Record<string, unknown>>;
  Marker: React.ComponentType<Record<string, unknown>>;
  YamapInstance: { init: (key: string) => Promise<void> };
}

let cached: Yamap | null | undefined;

/**
 * Нативный модуль карт, если он есть и ключ задан. `undefined` кэша значит
 * «ещё не пробовали», `null` — «пробовали, не вышло»: require дёргаем один раз.
 */
export function loadYamap(): Yamap | null {
  if (cached !== undefined) return cached;

  if (!MAPKIT_KEY) {
    cached = null;
    return cached;
  }

  try {
    // require, а не import: без ключа нативный модуль трогать незачем,
    // а инициализация MapKit должна случиться ровно один раз.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-yamap-plus') as Yamap;
    void module.YamapInstance.init(MAPKIT_KEY);
    cached = module;
  } catch {
    cached = null;
  }

  return cached;
}
