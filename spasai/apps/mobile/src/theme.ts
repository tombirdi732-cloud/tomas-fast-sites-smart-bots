import { useColorScheme } from 'react-native';

/**
 * Та же система, что в панели заведения: бумажный фон, чернильный текст,
 * жёлтый — только на ценник со скидкой и талон с кодом выдачи.
 */
export interface Theme {
  paper: string;
  card: string;
  cardSunk: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  rule: string;
  sticker: string;
  stickerInk: string;
  green: string;
  greenWash: string;
  ember: string;
  emberWash: string;
  dark: boolean;
}

const light: Theme = {
  paper: '#F6F5F1',
  card: '#FFFFFF',
  cardSunk: '#EFEEE8',
  ink: '#1A1B17',
  inkSoft: '#6B6E63',
  inkFaint: '#A3A698',
  rule: '#E2E1D8',
  sticker: '#FFD400',
  stickerInk: '#1A1B17',
  green: '#1F5E3D',
  greenWash: '#E6EFE8',
  ember: '#C2410C',
  emberWash: '#FBEAE1',
  dark: false,
};

const dark: Theme = {
  paper: '#131410',
  card: '#1C1E19',
  cardSunk: '#24261F',
  ink: '#F0EFE8',
  inkSoft: '#9A9C8F',
  inkFaint: '#6E7165',
  rule: '#2E312A',
  sticker: '#FFD400',
  stickerInk: '#1A1B17',
  green: '#6FBC8E',
  greenWash: '#1B2A21',
  ember: '#F97316',
  emberWash: '#2C1C11',
  dark: true,
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Цвет плашки статуса заказа. */
export function statusColors(
  status: string,
  theme: Theme,
): { bg: string; fg: string } {
  switch (status) {
    case 'paid':
    case 'ready':
      return { bg: theme.greenWash, fg: theme.green };
    case 'collected':
      return { bg: theme.cardSunk, fg: theme.inkSoft };
    case 'no_show':
      return { bg: theme.emberWash, fg: theme.ember };
    case 'pending_payment':
      return { bg: theme.sticker, fg: theme.stickerInk };
    default:
      return { bg: theme.cardSunk, fg: theme.inkSoft };
  }
}
