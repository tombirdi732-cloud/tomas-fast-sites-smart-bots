import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { BoxScreen } from './src/screens/BoxScreen';
import { CheckoutScreen } from './src/screens/CheckoutScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MapScreen } from './src/screens/MapScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { OrderScreen } from './src/screens/OrderScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { SessionProvider, useSession } from './src/session';
import { useTheme } from './src/theme';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/** Иконки вкладок: залитая — активная, контурная — обычная. */
const TAB_ICON: Record<keyof TabParamList, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Главная: ['home', 'home-outline'],
  Карта: ['location', 'location-outline'],
  Избранное: ['heart', 'heart-outline'],
  Заказы: ['bag-handle', 'bag-handle-outline'],
  Профиль: ['person', 'person-outline'],
};

function Tabs() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.inkSoft,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        tabBarIconStyle: { marginTop: 2 },
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.rule,
          height: 74,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarIcon: ({ color, focused }) => {
          const [active, idle] = TAB_ICON[route.name];
          return <Ionicons name={focused ? active : idle} size={23} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Главная" component={FeedScreen} />
      <Tab.Screen name="Карта" component={MapScreen} />
      <Tab.Screen name="Избранное" component={FavoritesScreen} />
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
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.green} />
      </View>
    );
  }

  if (!onboarded) return <OnboardingScreen />;
  if (!me) return <LoginScreen />;

  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.green,
      background: theme.bg,
      card: theme.card,
      text: theme.ink,
      border: theme.rule,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Box" component={BoxScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Оформление' }} />
        <Stack.Screen name="Order" component={OrderScreen} options={{ title: 'Заказ' }} />
        <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Отзыв' }} />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Уведомления' }}
        />
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
