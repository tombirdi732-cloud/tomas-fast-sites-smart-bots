import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Вкладки нижней навигации. */
export type TabParamList = {
  Главная: undefined;
  Карта: undefined;
  Избранное: undefined;
  Заказы: undefined;
  Профиль: undefined;
};

/** Экраны стека поверх вкладок. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Box: { boxId: string };
  Checkout: { boxId: string };
  Order: { orderId: string };
  Review: { orderId: string; merchantTitle: string };
  Notifications: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
