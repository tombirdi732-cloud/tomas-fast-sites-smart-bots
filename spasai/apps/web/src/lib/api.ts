/**
 * Тонкий клиент к API. Хранит пару токенов, сам обновляет access
 * по refresh при 401 и приводит ошибки к единому виду `{ code, message }`.
 */

const BASE = '/api';
const ACCESS_KEY = 'spasai.access';
const REFRESH_KEY = 'spasai.refresh';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
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

export const tokens = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  save(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = { code: 'UNKNOWN', message: `Ошибка ${response.status}` };
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // тело не JSON — оставляем заготовку
  }
  return new ApiError(response.status, body.code, body.message, body.details);
}

/** Обновление access-токена. Идёт ровно одно на все параллельные запросы. */
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;

  refreshing ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!response.ok) {
        tokens.clear();
        return false;
      }
      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      tokens.save(data.accessToken, data.refreshToken);
      return true;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const access = tokens.access;
    if (auth && access) headers.Authorization = `Bearer ${access}`;

    return fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  let response = await send();

  if (response.status === 401 && auth && tokens.refresh) {
    if (await refreshTokens()) {
      response = await send();
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/* ── типы ответов API ─────────────────────────────────────────── */

export interface Me {
  id: string;
  phone: string;
  name: string | null;
  role: 'customer' | 'merchant' | 'admin';
}

export interface Merchant {
  id: string;
  title: string;
  description: string | null;
  category: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  inn: string;
  legalName: string;
  timezone: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejectionReason: string | null;
  commissionRate: string;
  ratingAvg: string;
  ratingCount: number;
  verification?: Verification | null;
  createdAt?: string;
}

export interface Box {
  id: string;
  title: string;
  description: string | null;
  originalPrice: number;
  price: number;
  quantityTotal: number;
  quantityLeft: number;
  bestBefore: string;
  pickupStart: string;
  pickupEnd: string;
  category: string;
  allergens: string[];
  status: 'active' | 'sold_out' | 'expired' | 'cancelled';
  isRecurring: boolean;
  recurrenceRule: string | null;
}

export interface Order {
  id: string;
  quantity: number;
  boxPrice: number;
  serviceFee: number;
  total: number;
  commissionAmount: number;
  status: 'pending_payment' | 'paid' | 'ready' | 'collected' | 'cancelled' | 'refunded' | 'no_show';
  pickupCode: string | null;
  paidAt: string | null;
  collectedAt: string | null;
  createdAt: string;
  box?: { title: string; pickupStart: string; pickupEnd: string };
}

export interface MerchantStats {
  ordersToday: number;
  revenueToday: number;
  commissionToday: number;
  ordersTotal: number;
  boxesSavedTotal: number;
  activeBoxes: number;
  ratingAvg: number;
  ratingCount: number;
}

/** Результат автопроверки ИНН по реестру ФНС. */
export interface Verification {
  checked: boolean;
  found: boolean;
  active: boolean;
  legalName: string | null;
  ogrn: string | null;
  kind: 'LEGAL' | 'INDIVIDUAL' | null;
  address: string | null;
  management: string | null;
  status: string | null;
  warnings: string[];
}

export interface Invite {
  code: string;
  expiresAt: string;
  kind: 'merchant' | 'staff';
  note: string | null;
}

export interface StaffMember {
  id: string;
  role: 'owner' | 'staff';
  createdAt: string;
  user: { id: string; phone: string; name: string | null };
}

export interface AdminStats {
  gmv: number;
  platformRevenue: number;
  orders: number;
  ordersCollected: number;
  ordersNoShow: number;
  users: number;
  merchantsApproved: number;
  merchantsPending: number;
  boxesSaved: number;
  topMerchants: Array<{ id: string; title: string; orders: number; gmv: number }>;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  createdAt: string;
}
