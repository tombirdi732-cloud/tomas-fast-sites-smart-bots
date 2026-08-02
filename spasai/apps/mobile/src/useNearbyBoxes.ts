import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { ApiError, api } from './api';
import type { BoxListItem } from './api';

/** Красная площадь — запасные координаты, если геолокация недоступна. */
export const FALLBACK_COORDS = { lat: 55.7539, lng: 37.6208 };

export interface Filters {
  radius: number;
  category: string | null;
  maxPrice: number | null;
  favoritesOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  radius: 3000,
  category: null,
  maxPrice: null,
  favoritesOnly: false,
};

interface State {
  boxes: BoxListItem[];
  coords: { lat: number; lng: number };
  /** Геолокация не разрешена — показываем боксы вокруг запасной точки. */
  usingFallback: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Лента боксов рядом: координаты устройства + геопоиск на бэкенде.
 *
 * `at` перебивает геолокацию — так карта ищет там, куда её увели,
 * а не там, где стоит телефон.
 */
export function useNearbyBoxes(filters: Filters, at?: { lat: number; lng: number } | null) {
  const [state, setState] = useState<State>({
    boxes: [],
    coords: at ?? FALLBACK_COORDS,
    usingFallback: true,
    loading: true,
    error: null,
  });

  const atLat = at?.lat ?? null;
  const atLng = at?.lng ?? null;

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    let coords = FALLBACK_COORDS;
    let usingFallback = true;

    if (atLat !== null && atLng !== null) {
      coords = { lat: atLat, lng: atLng };
      usingFallback = false;
    } else {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.granted) {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          usingFallback = false;
        }
      } catch {
        // остаёмся на запасных координатах
      }
    }

    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radius: String(filters.radius),
      limit: '50',
    });
    if (filters.category) params.set('category', filters.category);
    if (filters.maxPrice !== null) params.set('maxPrice', String(filters.maxPrice));
    if (filters.favoritesOnly) params.set('favoritesOnly', 'true');

    try {
      const boxes = await api<BoxListItem[]>(`/boxes?${params.toString()}`);
      setState({ boxes, coords, usingFallback, loading: false, error: null });
    } catch (error) {
      setState({
        boxes: [],
        coords,
        usingFallback,
        loading: false,
        error: error instanceof ApiError ? error.message : 'Не удалось загрузить ленту',
      });
    }
  }, [filters.radius, filters.category, filters.maxPrice, filters.favoritesOnly, atLat, atLng]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
