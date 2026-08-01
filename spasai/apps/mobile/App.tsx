import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import { BoxScreen } from './src/screens/BoxScreen';
import { CheckoutScreen } from './src/screens/CheckoutScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MapScreen } from './src/screens/MapScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { OrderScreen } from './src/screens/OrderScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import type { RootStackParamList } from './src/navigation';
import { SessionProvider, useSession } from './src/session';
import { useTheme } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_GLYPH: Record<string, string> = {
  Лента: '≡',
  Карта: '◎',
  Заказы: '▤',
  Профиль: '◍',
};

function Tabs() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.ink,
        tabBarInactiveTintColor: theme.inkFaint,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.rule },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 17 }}>{TAB_GLYPH[route.name] ?? '•'}</Text>
        ),
      })}
    >
      <Tab.Screen name="Лента" component={FeedScreen} />
      <Tab.Screen name="Карта" component={MapScreen} />
      <Tab.Screen name="Заказы" component={OrdersScreen} />
      <Tab.Screen name="Профиль" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const theme = useTheme();
  const { me, ready, onboarded } = useSession();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.inkSoft} />
      </View>
    );
  }

  if (!onboarded) return <OnboardingScreen />;
  if (!me) return <LoginScreen />;

  const navTheme = theme.dark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: theme.paper, card: theme.card, text: theme.ink, border: theme.rule } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.paper, card: theme.card, text: theme.ink, border: theme.rule } };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Box" component={BoxScreen} options={{ title: 'Бокс' }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Оформление' }} />
        <Stack.Screen name="Order" component={OrderScreen} options={{ title: 'Заказ' }} />
        <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Отзыв' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
