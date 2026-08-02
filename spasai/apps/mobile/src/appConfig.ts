import { useEffect, useState } from 'react';

import { FALLBACK_CONFIG, api } from './api';
import type { AppConfig } from './api';

/**
 * Настройки платформы меняются раз в полгода, а нужны на каждом экране
 * оформления, — поэтому забираем их один раз за запуск и держим в памяти.
 */
let cached: AppConfig | null = null;
let inflight: Promise<AppConfig> | null = null;

export function loadAppConfig(): Promise<AppConfig> {
  if (cached) return Promise.resolve(cached);

  inflight ??= api<AppConfig>('/config')
    .then((config) => {
      cached = config;
      return config;
    })
    .catch(() => FALLBACK_CONFIG)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Настройки платформы; до ответа сервера — безопасные значения по умолчанию. */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(cached ?? FALLBACK_CONFIG);

  useEffect(() => {
    let alive = true;
    void loadAppConfig().then((loaded) => {
      if (alive) setConfig(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}

/**
 * До какого момента покупатель может отменить заказ сам: либо грейс-период
 * с оформления, либо за два часа до выдачи — что позже. Правило повторяет
 * `OrdersService.cancellationDeadline` на сервере, чтобы кнопка отмены
 * не предлагала то, что бэкенд отклонит.
 */
export function cancellationDeadline(
  createdAtIso: string,
  pickupStartIso: string,
  config: AppConfig,
): Date {
  return new Date(
    Math.max(
      new Date(createdAtIso).getTime() + config.cancellationGraceMs,
      new Date(pickupStartIso).getTime() - config.cancellationLeadMs,
    ),
  );
}
