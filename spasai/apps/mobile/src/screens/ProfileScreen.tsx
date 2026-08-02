import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api';
import { Button, Card } from '../components';
import type { RootStackParamList } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';
import type { Theme } from '../theme';

interface Favorite {
  id: string;
  merchant?: { id: string; title: string; address: string };
}

/** Телефон из API приходит как +79991234567 — показываем по-человечески. */
function prettyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 11) return phone;
  return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
}

/** Профиль: кто вы, избранное и настройки (экран 9 ТЗ). */
export function ProfileScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { me, updateName, logout } = useSession();
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setFavorites(await api<Favorite[]>('/favorites'));
        } catch {
          // экран не критичен — молча оставляем пустым
        }
      })();
    }, []),
  );

  async function save() {
    const name = draft.trim();
    if (!name) return;
    setSaving(true);
    try {
      await updateName(name);
      setEditing(false);
    } catch {
      // оставляем поле открытым, чтобы можно было попробовать ещё раз
    } finally {
      setSaving(false);
    }
  }

  const initial = (me?.name ?? '').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 32 }}>
        {/* шапка: аватар, имя, телефон */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.greenWash,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initial ? (
              <Text style={{ color: theme.green, fontSize: 26, fontWeight: '800' }}>{initial}</Text>
            ) : (
              <Ionicons name="person" size={28} color={theme.green} />
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: theme.ink, fontSize: 22, fontWeight: '800' }}>
              {me?.name ?? 'Без имени'}
            </Text>
            <Text style={{ color: theme.inkSoft, fontSize: 15, marginTop: 2 }}>
              {me?.phone ? prettyPhone(me.phone) : ''}
            </Text>
          </View>
        </View>

        {/* имя правится прямо здесь */}
        {editing ? (
          <Card style={{ gap: 12 }}>
            <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Как вас зовут</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              maxLength={120}
              placeholder="Ольга"
              placeholderTextColor={theme.inkFaint}
              style={{
                backgroundColor: theme.bg,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: theme.ink,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Сохранить"
                  onPress={() => void save()}
                  loading={saving}
                  disabled={!draft.trim()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Отмена" variant="ghost" onPress={() => setEditing(false)} />
              </View>
            </View>
          </Card>
        ) : (
          <Card style={{ padding: 0 }}>
            <Row
              theme={theme}
              icon="person-outline"
              label={me?.name ? 'Изменить имя' : 'Указать имя'}
              onPress={() => {
                setDraft(me?.name ?? '');
                setEditing(true);
              }}
            />
            <Row
              theme={theme}
              icon="bag-handle-outline"
              label="Мои заказы"
              onPress={() => navigation.navigate('Tabs', { screen: 'Заказы' })}
            />
            <Row
              theme={theme}
              icon="notifications-outline"
              label="Уведомления"
              onPress={() => navigation.navigate('Notifications')}
              last
            />
          </Card>
        )}

        {/* избранные заведения */}
        <Text style={{ color: theme.inkSoft, fontSize: 12, letterSpacing: 1, marginTop: 6 }}>
          ИЗБРАННЫЕ ЗАВЕДЕНИЯ
        </Text>

        {favorites.length === 0 ? (
          <Text style={{ color: theme.inkSoft, lineHeight: 21 }}>
            Пока пусто. Добавляйте заведения в избранное — пришлём пуш, когда появится бокс.
          </Text>
        ) : (
          favorites.map((favorite) => (
            <Card key={favorite.id}>
              <Text style={{ color: theme.ink, fontWeight: '700' }}>
                {favorite.merchant?.title ?? 'Заведение'}
              </Text>
              <Text style={{ color: theme.inkSoft, marginTop: 4 }}>
                {favorite.merchant?.address ?? ''}
              </Text>
            </Card>
          ))
        )}

        <View style={{ marginTop: 10 }}>
          <Button title="Выйти" variant="ghost" onPress={() => void logout()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Строка списка настроек: иконка, подпись, шеврон. */
function Row({
  theme,
  icon,
  label,
  onPress,
  last = false,
}: {
  theme: Theme;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 15,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.rule,
        backgroundColor: pressed ? theme.cardSunk : 'transparent',
      })}
    >
      <Ionicons name={icon} size={20} color={theme.inkSoft} />
      <Text style={{ flex: 1, color: theme.ink, fontSize: 16 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.inkFaint} />
    </Pressable>
  );
}
