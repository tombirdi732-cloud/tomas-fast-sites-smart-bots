import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, getApiUrl, setApiUrl } from '../api';
import { Button, Notice } from '../components';
import { awaitExternalLogin, startExternalLogin } from '../externalLogin';
import { useSession } from '../session';
import { useTheme } from '../theme';

/**
 * Вход через Яндекс ID (экран 2 ТЗ).
 *
 * Ни номера, ни кода: SMS в России платные и требуют ИП, а Telegram
 * с российского хостинга недоступен. Яндекс — бесплатно и в один шаг.
 */
export function LoginScreen() {
  const theme = useTheme();
  const { reload } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const cancelled = useRef(false);

  // Адрес сервера зашит в сборку. Поле нужно только при отладке, поэтому
  // спрятано за долгим нажатием на заголовок — на глаза покупателю
  // такое попадаться не должно.
  const [serverOpen, setServerOpen] = useState(false);
  const [server, setServer] = useState(getApiUrl());

  async function login() {
    setError(null);
    setBusy(true);
    try {
      const { state, url, expiresIn } = await startExternalLogin('yandex');
      await Linking.openURL(url);

      cancelled.current = false;
      setWaiting(true);

      const ok = await awaitExternalLogin('yandex', state, expiresIn, () => cancelled.current);
      if (ok) {
        await reload();
      } else if (!cancelled.current) {
        setError('Время на вход истекло. Попробуйте ещё раз.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть страницу входа');
    } finally {
      setWaiting(false);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center' }}
        >
          <Pressable onLongPress={() => setServerOpen((open) => !open)} delayLongPress={800}>
            <Text style={{ color: theme.ink, fontSize: 34, fontWeight: '800', letterSpacing: 1 }}>
              СПАСАЙ
            </Text>
          </Pressable>

          <Text style={{ color: theme.inkSoft, fontSize: 15, lineHeight: 22 }}>
            Еда из кафе и пекарен рядом — со скидкой до 70%, пока она не пропала.
          </Text>

          {error && <Notice>{error}</Notice>}

          {waiting ? (
            <>
              <Text style={{ color: theme.inkSoft, fontSize: 15, lineHeight: 22 }}>
                Открыли Яндекс. Подтвердите вход и возвращайтесь — дальше всё само.
              </Text>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => {
                  cancelled.current = true;
                  setWaiting(false);
                }}
              />
            </>
          ) : (
            <Button title="Войти через Яндекс" onPress={() => void login()} loading={busy} />
          )}

          {serverOpen && (
            <>
              <TextInput
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.rule,
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: theme.ink,
                }}
                value={server}
                onChangeText={setServer}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.0.10:3000/api"
                placeholderTextColor={theme.inkFaint}
              />
              <Button
                title="Сохранить адрес"
                variant="ghost"
                onPress={() => {
                  void setApiUrl(server).then(() => {
                    setServer(getApiUrl());
                    setServerOpen(false);
                  });
                }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
