import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

/**
 * Насколько точно адрес привязан к местности. Для боксов нужен дом:
 * покупатель идёт к конкретной двери, а не «в район».
 */
export type AddressPrecision = 'house' | 'street' | 'city' | 'none';

export interface AddressSuggestion {
  /** Адрес одной строкой, как его вернул реестр. */
  value: string;
  lat: number | null;
  lng: number | null;
  precision: AddressPrecision;
  city: string | null;
  /** IANA-зона, выведенная из смещения. Заведение может её поправить. */
  timezone: string | null;
}

interface DadataAddress {
  value?: string;
  data?: {
    geo_lat?: string | null;
    geo_lon?: string | null;
    /** 0 — точные координаты дома, 1 — соседний дом, 2 — улица, 3 — город, 4 — не определено. */
    qc_geo?: string | number | null;
    city?: string | null;
    settlement?: string | null;
    region?: string | null;
    /** Строка вида «UTC+3». */
    timezone?: string | null;
  };
}

/**
 * В России смещение постоянное — перевода часов нет, поэтому по смещению
 * однозначно выбирается зона. Берём самый населённый город каждой зоны:
 * заведение всё равно видит поле и может поправить.
 */
const ZONE_BY_OFFSET: Record<string, string> = {
  'UTC+2': 'Europe/Kaliningrad',
  'UTC+3': 'Europe/Moscow',
  'UTC+4': 'Europe/Samara',
  'UTC+5': 'Asia/Yekaterinburg',
  'UTC+6': 'Asia/Omsk',
  'UTC+7': 'Asia/Krasnoyarsk',
  'UTC+8': 'Asia/Irkutsk',
  'UTC+9': 'Asia/Yakutsk',
  'UTC+10': 'Asia/Vladivostok',
  'UTC+11': 'Asia/Magadan',
  'UTC+12': 'Asia/Kamchatka',
};

function precisionOf(qc: string | number | null | undefined): AddressPrecision {
  switch (String(qc ?? '')) {
    case '0':
    case '1':
      return 'house';
    case '2':
      return 'street';
    case '3':
      return 'city';
    default:
      return 'none';
  }
}

/**
 * Подсказки адресов с координатами (DaData).
 *
 * Нужны там, где заведение указывает, где его искать: вводить широту
 * и долготу руками нельзя — ошибутся в знаке и уедут в другое полушарие,
 * а весь геопоиск построен именно на этих координатах.
 *
 * Токен тот же, что для проверки ИНН. Без токена подсказок нет, и панель
 * показывает поля координат — сервис от этого не ломается.
 */
@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return this.config.get('DADATA_TOKEN', { infer: true }).length > 0;
  }

  async suggest(query: string, limit = 7): Promise<AddressSuggestion[]> {
    if (!this.enabled || query.trim().length < 3) return [];

    try {
      const response = await fetch(DADATA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${this.config.get('DADATA_TOKEN', { infer: true })}`,
        },
        body: JSON.stringify({ query: query.trim(), count: limit }),
      });

      if (!response.ok) {
        this.logger.warn(`DaData ответила ${response.status} на подсказку адреса`);
        return [];
      }

      const payload = (await response.json()) as { suggestions?: DadataAddress[] };

      return (payload.suggestions ?? []).map((item) => {
        const data = item.data ?? {};
        const lat = data.geo_lat ? Number(data.geo_lat) : null;
        const lng = data.geo_lon ? Number(data.geo_lon) : null;

        return {
          value: item.value ?? '',
          lat: lat !== null && Number.isFinite(lat) ? lat : null,
          lng: lng !== null && Number.isFinite(lng) ? lng : null,
          precision: precisionOf(data.qc_geo),
          city: data.city ?? data.settlement ?? null,
          timezone: data.timezone ? (ZONE_BY_OFFSET[data.timezone] ?? null) : null,
        };
      });
    } catch (error) {
      this.logger.warn(
        `Не удалось получить подсказки адреса: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
