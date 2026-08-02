import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';

/** Что удалось выяснить об организации по ИНН. */
export interface InnCheck {
  /** Проверка вообще выполнялась (задан ли токен DaData). */
  checked: boolean;
  /** Организация найдена в реестре. */
  found: boolean;
  /** Действующая, а не ликвидированная или в процессе. */
  active: boolean;
  legalName: string | null;
  ogrn: string | null;
  /** LEGAL — юрлицо, INDIVIDUAL — ИП. */
  kind: 'LEGAL' | 'INDIVIDUAL' | null;
  address: string | null;
  /** Руководитель — с ним и стоит сверять того, кто подал заявку. */
  management: string | null;
  status: string | null;
  /** На что обратить внимание модератору. */
  warnings: string[];
}

const EMPTY: InnCheck = {
  checked: false,
  found: false,
  active: false,
  legalName: null,
  ogrn: null,
  kind: null,
  address: null,
  management: null,
  status: null,
  warnings: [],
};

interface DadataParty {
  value?: string;
  data?: {
    inn?: string;
    ogrn?: string;
    type?: string;
    name?: { short_with_opf?: string; full_with_opf?: string };
    state?: { status?: string };
    address?: { value?: string };
    management?: { name?: string; post?: string };
  };
}

/**
 * Автопроверка ИНН по реестру ФНС через DaData.
 *
 * Это не замена модерации, а подготовка к ней: модератор видит, что реестр
 * знает про эту организацию, совпадает ли название с заявкой и не ликвидирована
 * ли она. Решение всё равно принимает человек.
 *
 * Без токена (`DADATA_TOKEN`) проверка не выполняется и заявка уходит на
 * полностью ручную модерацию — работа сервиса от этого не ломается.
 */
@Injectable()
export class InnCheckService {
  private readonly logger = new Logger(InnCheckService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return this.config.get('DADATA_TOKEN', { infer: true }).length > 0;
  }

  async check(inn: string, claimedLegalName: string): Promise<InnCheck> {
    if (!this.enabled) return { ...EMPTY };

    let party: DadataParty | undefined;

    try {
      const response = await fetch(DADATA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${this.config.get('DADATA_TOKEN', { infer: true })}`,
        },
        body: JSON.stringify({ query: inn }),
      });

      if (!response.ok) {
        this.logger.warn(`DaData ответила ${response.status}, заявка уходит на ручную проверку`);
        return { ...EMPTY, checked: true, warnings: ['Реестр недоступен, проверьте вручную'] };
      }

      const payload = (await response.json()) as { suggestions?: DadataParty[] };
      party = payload.suggestions?.[0];
    } catch (error) {
      this.logger.warn(
        `Не удалось проверить ИНН: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ...EMPTY, checked: true, warnings: ['Реестр недоступен, проверьте вручную'] };
    }

    if (!party?.data) {
      return {
        ...EMPTY,
        checked: true,
        warnings: ['ИНН не найден в реестре — скорее всего, опечатка или организация не существует'],
      };
    }

    const data = party.data;
    const status = data.state?.status ?? null;
    const active = status === 'ACTIVE';
    const legalName = data.name?.short_with_opf ?? data.name?.full_with_opf ?? party.value ?? null;

    const warnings: string[] = [];
    if (!active) {
      warnings.push(`Организация не действующая: статус ${status ?? 'неизвестен'}`);
    }
    if (legalName && !namesLookAlike(legalName, claimedLegalName)) {
      warnings.push(`В реестре другое название: «${legalName}» вместо «${claimedLegalName}»`);
    }

    return {
      checked: true,
      found: true,
      active,
      legalName,
      ogrn: data.ogrn ?? null,
      kind: data.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : data.type === 'LEGAL' ? 'LEGAL' : null,
      address: data.address?.value ?? null,
      management: data.management?.name
        ? `${data.management.name}${data.management.post ? `, ${data.management.post}` : ''}`
        : null,
      status,
      warnings,
    };
  }
}

/**
 * Организационно-правовые формы и служебные слова: на сравнение названий
 * они не влияют.
 */
const LEGAL_FORM_WORDS = new Set([
  'ооо', 'оао', 'зао', 'пао', 'ао', 'ип', 'нко', 'ано', 'общество',
  'с', 'ограниченной', 'ответственностью', 'индивидуальный', 'предприниматель',
]);

/**
 * Сравнение названий без кавычек, ОПФ и регистра: «ООО "Тёплый хлеб"» и
 * «ООО Теплый хлеб» — это одно и то же, придираться к оформлению не нужно.
 *
 * Разбираем по словам, а не регулярками с `\b`: в JavaScript граница слова
 * опирается на латиницу, и для кириллицы просто не срабатывает.
 */
export function namesLookAlike(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((word) => word.length > 0 && !LEGAL_FORM_WORDS.has(word))
      .join(' ');

  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;

  return left === right || left.includes(right) || right.includes(left);
}
