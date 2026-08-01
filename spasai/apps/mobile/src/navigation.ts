import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Экраны стека поверх вкладок. */
export type RootStackParamList = {
  Tabs: undefined;
  Box: { boxId: string };
  Checkout: { boxId: string };
  Order: { orderId: string };
  Review: { orderId: string; merchantTitle: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
