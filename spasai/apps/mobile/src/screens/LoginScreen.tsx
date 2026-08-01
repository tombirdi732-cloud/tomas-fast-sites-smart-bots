import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, api, saveTokens } from '../api';
import { Button, Notice } from '../components';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.paper }}>
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
