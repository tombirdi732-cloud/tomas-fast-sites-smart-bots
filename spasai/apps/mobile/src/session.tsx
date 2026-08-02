import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, api, clearTokens, getRefreshToken, loadApiUrl, loadTokens } from './api';
import type { Me } from './api';

const ONBOARDED_KEY = 'spasai.onboarded';

interface SessionValue {
  me: Me | null;
  ready: boolean;
  onboarded: boolean;
  finishOnboarding: () => void;
  reload: () => Promise<void>;
  /** Сохранить имя из профиля. */
  updateName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  const reload = useCallback(async () => {
    const hasToken = await loadTokens();
    if (!hasToken) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>('/auth/me'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await clearTokens();
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadApiUrl();
      setOnboarded((await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true');
      await reload();
      setReady(true);
    })();
  }, [reload]);

  const finishOnboarding = useCallback(() => {
    setOnboarded(true);
    void AsyncStorage.setItem(ONBOARDED_KEY, 'true');
  }, []);

  const updateName = useCallback(async (name: string) => {
    const updated = await api<Me>('/auth/me', { method: 'PATCH', body: { name } });
    setMe(updated);
  }, []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await api('/auth/logout', { method: 'POST', body: { refreshToken: refresh }, auth: false });
      } catch {
        // выходим локально в любом случае
      }
    }
    await clearTokens();
    setMe(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ me, ready, onboarded, finishOnboarding, reload, updateName, logout }),
    [me, ready, onboarded, finishOnboarding, reload, updateName, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession вызван вне SessionProvider');
  return value;
}
