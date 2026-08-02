import { useColorScheme } from 'react-native';

/**
 * Оформление приложения: светлый прохладный фон, белые карточки,
 * зелёный — на действия и выгоду, тёплые цвета — на срок годности.
 * Чем меньше дней до конца срока, тем тревожнее плашка.
 */
export interface Theme {
  bg: string;
  card: string;
  cardSunk: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  rule: string;

  green: string;
  greenDark: string;
  greenWash: string;

  /** Плашка срока: спокойный / средний / срочный. */
  fresh: string;
  soon: string;
  urgent: string;
  /** Текст на плашке срока. */
  badgeInk: string;

  /** Плашка скидки. */
  discount: string;

  /**
   * Подложки предупреждений и ошибок. В тёмной теме они тоже тёмные —
   * иначе светлый текст ложится на светлый фон и его не видно.
   */
  warnWash: string;
  dangerWash: string;

  star: string;
  overlay: string;
  dark: boolean;
}

const light: Theme = {
  bg: '#F4F6F7',
  card: '#FFFFFF',
  cardSunk: '#EEF1F3',
  ink: '#1A1D1F',
  inkSoft: '#8B9296',
  inkFaint: '#C4CACD',
  rule: '#EAEEF0',

  green: '#21A038',
  greenDark: '#1B8A30',
  greenWash: '#E8F5EC',

  fresh: '#FFC531',
  soon: '#FF8A34',
  urgent: '#E5342B',
  badgeInk: '#FFFFFF',

  discount: '#FF7A2F',

  warnWash: '#FFF4E0',
  dangerWash: '#FDECEA',

  star: '#FFB800',
  overlay: 'rgba(0,0,0,0.45)',
  dark: false,
};

const dark: Theme = {
  bg: '#111315',
  card: '#1B1E21',
  cardSunk: '#24282B',
  ink: '#F2F4F5',
  inkSoft: '#9AA1A6',
  inkFaint: '#5F676C',
  rule: '#2A2F33',

  green: '#3EBE58',
  greenDark: '#2FA648',
  greenWash: '#17301D',

  fresh: '#E0AC21',
  soon: '#FF8A34',
  urgent: '#F04438',
  badgeInk: '#141618',

  discount: '#FF7A2F',

  warnWash: '#332615',
  dangerWash: '#3A1E1C',

  star: '#FFB800',
  overlay: 'rgba(0,0,0,0.55)',
  dark: true,
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Русское склонение: 1 день, 2 дня, 5 дней. */
export function pluralDays(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${days} дня`;
  return `${days} дней`;
}

export interface ShelfLife {
  label: string;
  color: keyof Pick<Theme, 'fresh' | 'soon' | 'urgent'>;
}

/**
 * Плашка срока годности. Цвет — сигнал срочности: чем меньше времени,
 * тем горячее. Пользователь должен видеть это до покупки (раздел 7.1 ТЗ).
 */
export function shelfLife(bestBeforeIso: string, now: number = Date.now()): ShelfLife {
  const left = new Date(bestBeforeIso).getTime() - now;
  const hours = Math.floor(left / 3_600_000);

  if (left <= 0) return { label: 'истёк', color: 'urgent' };
  if (hours < 24) return { label: hours <= 1 ? 'меньше часа' : `${hours} ч`, color: 'urgent' };

  const days = Math.floor(hours / 24);
  if (days <= 2) return { label: pluralDays(days), color: 'soon' };
  return { label: pluralDays(days), color: 'fresh' };
}

/** Цвет плашки статуса заказа. */
export function statusColors(status: string, theme: Theme): { bg: string; fg: string } {
  switch (status) {
    case 'paid':
    case 'ready':
      return { bg: theme.greenWash, fg: theme.green };
    case 'collected':
      return { bg: theme.cardSunk, fg: theme.inkSoft };
    case 'no_show':
      return { bg: theme.dangerWash, fg: theme.urgent };
    case 'pending_payment':
      return { bg: theme.warnWash, fg: theme.soon };
    default:
      return { bg: theme.cardSunk, fg: theme.inkSoft };
  }
}
