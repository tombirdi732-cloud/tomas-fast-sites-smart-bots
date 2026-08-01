import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * Клиент API. Адрес берётся из app.json → extra.apiUrl.
 * На эмуляторе Android хост-машина доступна как 10.0.2.2.
 */
const BASE = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:3000/api';

const ACCESS_KEY = 'spasai.access';
const REFRESH_KEY = 'spasai.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadTokens(): Promise<boolean> {
  const pairs = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
  accessToken = pairs[0]?.[1] ?? null;
  refreshToken = pairs[1]?.[1] ?? null;
  return accessToken !== null;
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await AsyncStorage.multiSet([
    [ACCESS_KEY, access],
    [REFRESH_KEY, refresh],
  ]);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;

  const response = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await clearTokens();
    return false;
  }

  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  await saveTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

    return fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  let response = await send();

  if (response.status === 401 && auth && refreshToken && (await tryRefresh())) {
    response = await send();
  }

  if (!response.ok) {
    let payload = { code: 'UNKNOWN', message: `Ошибка ${response.status}` };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // тело не JSON
    }
    throw new ApiError(response.status, payload.code, payload.message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ── типы ─────────────────────────────────────────────────────── */

export interface BoxListItem {
  id: string;
  title: string;
  description: string | null;
  price: number;
  originalPrice: number;
  discountPercent: number;
  quantityLeft: number;
  bestBefore: string;
  pickupStart: string;
  pickupEnd: string;
  category: string;
  allergens: string[];
  photoUrl: string | null;
  distanceM: number;
  merchant: {
    id: string;
    title: string;
    address: string;
    lat: number;
    lng: number;
    logoUrl: string | null;
    ratingAvg: number;
    ratingCount: number;
    timezone: string;
  };
}

export interface Order {
  id: string;
  quantity: number;
  boxPrice: number;
  serviceFee: number;
  total: number;
  status: string;
  pickupCode: string | null;
  createdAt: string;
  box?: { id: string; title: string; pickupStart: string; pickupEnd: string };
  merchant?: { id: string; title: string; address: string };
}

export interface Me {
  id: string;
  phone: string;
  name: string | null;
}
