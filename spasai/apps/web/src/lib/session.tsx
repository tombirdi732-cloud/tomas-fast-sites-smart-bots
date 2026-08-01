import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, api, tokens } from './api';
import type { Me, Merchant } from './api';

interface SessionValue {
  me: Me | null;
  merchant: Merchant | null;
  loading: boolean;
  /** Перечитать пользователя и заведение (после регистрации точки). */
  reload: () => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tokens.access) {
      setMe(null);
      setMerchant(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const user = await api<Me>('/auth/me');
      setMe(user);

      if (user.role === 'merchant' || user.role === 'admin') {
        const list = await api<Merchant[]>('/merchants/me');
        setMerchant(list[0] ?? null);
      } else {
        setMerchant(null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        tokens.clear();
      }
      setMe(null);
      setMerchant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const logout = useCallback(() => {
    const refresh = tokens.refresh;
    if (refresh) {
      void api('/auth/logout', { method: 'POST', body: { refreshToken: refresh }, auth: false });
    }
    tokens.clear();
    setMe(null);
    setMerchant(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ me, merchant, loading, reload, logout }),
    [me, merchant, loading, reload, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession вызван вне SessionProvider');
  return value;
}
