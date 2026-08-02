import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * Адрес API. По умолчанию берётся из app.json → extra.apiUrl
 * (на эмуляторе Android хост-машина доступна как 10.0.2.2),
 * но пользователь может задать свой — в собранном APK это единственный
 * способ указать, где живёт бэкенд.
 */
const DEFAULT_BASE =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:3000/api';

const ACCESS_KEY = 'spasai.access';
const REFRESH_KEY = 'spasai.refresh';
const BASE_URL_KEY = 'spasai.apiUrl';

let BASE = DEFAULT_BASE;

export function getApiUrl(): string {
  return BASE;
}

export async function loadApiUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(BASE_URL_KEY);
  if (stored) BASE = stored;
  return BASE;
}

/** Сохранить адрес сервера. Пустая строка возвращает значение по умолчанию. */
export async function setApiUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (trimmed) {
    BASE = trimmed;
    await AsyncStorage.setItem(BASE_URL_KEY, trimmed);
  } else {
    BASE = DEFAULT_BASE;
    await AsyncStorage.removeItem(BASE_URL_KEY);
  }
}

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

/**
 * Сколько ждём ответ. Без этого запрос к недоступному серверу висит,
 * пока его не оборвёт система, — а на экране всё это время крутится
 * бесконечная загрузка без единого объяснения.
 */
const TIMEOUT_MS = 12_000;

/** Сервер не ответил: не дозвонились, оборвалось или вышло время. */
export const NETWORK_ERROR = 'NETWORK_ERROR';

let accessToken: string | null = null;
let refreshToken: string | null = null;

/** fetch с таймаутом: сетевые сбои приводятся к понятной ApiError. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(
      0,
      NETWORK_ERROR,
      `Сервер ${BASE} не отвечает. Проверьте адрес — ссылка «Сервер» на экране входа.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

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

  const response = await fetchWithTimeout(`${BASE}/auth/refresh`, {
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

    return fetchWithTimeout(`${BASE}${path}`, {
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

/** Настройки платформы: как платим и до какого момента можно отменить. */
export interface AppConfig {
  paymentsMode: 'on_pickup' | 'online';
  serviceFee: number;
  cancellationGraceMs: number;
  cancellationLeadMs: number;
}

/**
 * Пока настройки не пришли, считаем, что платим на кассе: в этом режиме
 * платформа не берёт сервисный сбор, и обещать его на экране незачем.
 */
export const FALLBACK_CONFIG: AppConfig = {
  paymentsMode: 'on_pickup',
  serviceFee: 0,
  cancellationGraceMs: 15 * 60 * 1000,
  cancellationLeadMs: 2 * 60 * 60 * 1000,
};

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

export interface Favorite {
  id: string;
  merchantId: string;
  merchant?: { id: string; title: string; address: string; logoUrl: string | null };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  createdAt: string;
}
