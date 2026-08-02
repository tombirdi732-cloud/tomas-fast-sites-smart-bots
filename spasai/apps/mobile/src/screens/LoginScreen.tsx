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

import { ApiError, api, getApiUrl, saveTokens, setApiUrl } from '../api';
import { Button, Notice } from '../components';
import { loginAsDemo } from '../demoLogin';
import { awaitExternalLogin, startExternalLogin } from '../externalLogin';
import type { Provider } from '../externalLogin';
import { useSession } from '../session';
import { useTheme } from '../theme';

/** Вход по номеру телефона и SMS-коду (экран 2 ТЗ). В dev код всегда 0000. */
export function LoginScreen() {
  const theme = useTheme();
  const { reload } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Адрес бэкенда: в собранном APK его нужно указать вручную.
  const [serverOpen, setServerOpen] = useState(false);
  const [server, setServer] = useState(getApiUrl());
  // Пока ждём подтверждения на стороне сервиса, экран показывает подсказку.
  const [waitingFor, setWaitingFor] = useState<Provider | null>(null);
  const cancelExternal = useRef(false);

  const input = {
    backgroundColor: theme.card,
    borderColor: theme.rule,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.ink,
  };

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<{ retryAfter: number; devCode?: string }>('/auth/request-code', {
        method: 'POST',
        body: { phone },
        auth: false,
      });
      setStep('code');
      setHint(
        result.devCode
          ? `Dev-режим: код ${result.devCode}, SMS не отправляется`
          : 'Отправили код в SMS',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  }

  /** Вход через внешний сервис: уводим подтверждать и ждём результата. */
  async function external(provider: Provider) {
    setError(null);
    setBusy(true);
    try {
      const { state, url, expiresIn } = await startExternalLogin(provider);
      await Linking.openURL(url);

      cancelExternal.current = false;
      setWaitingFor(provider);

      const ok = await awaitExternalLogin(provider, state, expiresIn, () => cancelExternal.current);
      if (ok) {
        await reload();
      } else if (!cancelExternal.current) {
        setError('Время на вход истекло. Попробуйте ещё раз.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть страницу входа');
    } finally {
      setWaitingFor(null);
      setBusy(false);
    }
  }

  /** Вход без номера и кода — только против сервера в dev-режиме. */
  async function demo() {
    setError(null);
    setBusy(true);
    try {
      await loginAsDemo();
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Сервер ${getApiUrl()} недоступен. Проверьте адрес — кнопка «Сервер» ниже.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<{ accessToken: string; refreshToken: string }>('/auth/verify-code', {
        method: 'POST',
        body: { phone, code, ...(name ? { name } : {}) },
        auth: false,
      });
      await saveTokens(result.accessToken, result.refreshToken);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center' }}>
          <Text style={{ color: theme.ink, fontSize: 34, fontWeight: '800', letterSpacing: 1 }}>
            СПАСАЙ
          </Text>

          {error && <Notice>{error}</Notice>}
          {hint && step === 'code' && <Notice tone="good">{hint}</Notice>}

          {step === 'phone' ? (
            <>
              {waitingFor ? (
                <>
                  <Text style={{ color: theme.inkSoft, fontSize: 15, lineHeight: 22 }}>
                    {waitingFor === 'yandex'
                      ? 'Открыли Яндекс. Подтвердите вход и возвращайтесь — дальше всё само.'
                      : 'Открыли Telegram. Нажмите там «Старт» и возвращайтесь — дальше всё само.'}
                  </Text>
                  <Button
                    title="Отмена"
                    variant="ghost"
                    onPress={() => {
                      cancelExternal.current = true;
                      setWaitingFor(null);
                    }}
                  />
                </>
              ) : (
                <Button
                  title="Войти через Яндекс"
                  onPress={() => void external('yandex')}
                  loading={busy}
                />
              )}

              <Text style={{ color: theme.inkFaint, fontSize: 13, textAlign: 'center' }}>
                или по номеру телефона
              </Text>

              <Text style={{ color: theme.inkSoft, fontSize: 15, lineHeight: 22 }}>
                Введите номер телефона — пришлём код для входа.
              </Text>
              <TextInput
                style={input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+7 999 123-45-67"
                placeholderTextColor={theme.inkFaint}
                autoComplete="tel"
              />
              <Button
                title="Получить код"
                onPress={() => void requestCode()}
                loading={busy}
                disabled={phone.replace(/\D/g, '').length < 11}
              />
              <Text style={{ color: theme.inkFaint, fontSize: 13 }}>
                Код можно запросить не чаще раза в минуту.
              </Text>

              <Button
                title="Войти без кода — посмотреть приложение"
                variant="ghost"
                onPress={() => void demo()}
                loading={busy}
              />
              <Text style={{ color: theme.inkFaint, fontSize: 13 }}>
                Временный вход, пока не подключена рассылка SMS. На боевом сервере не работает.
              </Text>

              <Pressable onPress={() => setServerOpen((open) => !open)} hitSlop={8}>
                <Text style={{ color: theme.inkSoft, fontSize: 13, textDecorationLine: 'underline' }}>
                  Сервер: {getApiUrl()}
                </Text>
              </Pressable>

              {serverOpen && (
                <>
                  <TextInput
                    style={input}
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
            </>
          ) : (
            <>
              <TextInput
                style={[input, { fontSize: 30, letterSpacing: 12, textAlign: 'center', fontWeight: '700' }]}
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="0000"
                placeholderTextColor={theme.inkFaint}
              />
              <TextInput
                style={input}
                value={name}
                onChangeText={setName}
                placeholder="Как вас зовут"
                placeholderTextColor={theme.inkFaint}
              />
              <Button
                title="Войти"
                onPress={() => void verify()}
                loading={busy}
                disabled={code.length !== 4}
              />
              <Button
                title="Изменить номер"
                variant="ghost"
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setHint(null);
                }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
