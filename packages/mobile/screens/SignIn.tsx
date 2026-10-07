import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import type {
  SteamGuardHandler,
  SteamGuardPrompt,
} from 'vaporchat/steam/credentialLogin';
import type { SteamCredentials } from 'vaporchat/steam/logOn';
import { Field } from '../components/Field';
import { GradientButton } from '../components/GradientButton';
import { Logo } from '../components/Logo';
import { useBackHandler } from '../components/useBackHandler';
import { colors } from '../theme';

interface GuardRequest {
  /** a new prompt (after a wrong code) starts over with an empty field */
  id: number;
  prompt: SteamGuardPrompt;
  answer: (code: string) => void;
  cancel: () => void;
}

function guardMessage({
  codeType,
  emailDomain,
  canApproveOnDevice,
}: SteamGuardPrompt) {
  const approve = 'approve the sign-in in the Steam Mobile app';
  if (codeType === 'email') {
    const code = `Enter the code Steam emailed to your address at ${emailDomain ?? 'your email'}`;
    return canApproveOnDevice ? `${code}, or ${approve}.` : `${code}.`;
  }
  if (codeType === 'authenticator') {
    const code = 'Enter the code from your Steam Guard authenticator';
    return canApproveOnDevice ? `${code}, or ${approve}.` : `${code}.`;
  }
  return `Please ${approve}.`;
}

function SteamGuard({ guard }: { guard: GuardRequest }) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const { codeType, lastCodeWrong } = guard.prompt;
  useBackHandler(() => {
    guard.cancel();
    return true;
  });

  function submit() {
    if (code.trim() === '') return;
    setChecking(true);
    guard.answer(code.trim());
  }

  return (
    <View style={styles.form}>
      <View style={styles.guardIcon}>
        <Ionicons
          name={codeType ? 'shield-checkmark' : 'phone-portrait-outline'}
          size={36}
          color={colors.accent}
        />
      </View>
      <Text style={styles.title}>Steam Guard</Text>
      <Text style={styles.message}>{guardMessage(guard.prompt)}</Text>
      {lastCodeWrong && (
        <Text style={[styles.error, styles.centered]}>
          That code was wrong, try again.
        </Text>
      )}
      {codeType && (
        <>
          <Field
            style={styles.code}
            value={code}
            onChangeText={setCode}
            placeholder="•••••"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={5}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <GradientButton
            title="Submit code"
            busy={checking}
            disabled={code.trim() === ''}
            onPress={submit}
          />
        </>
      )}
      {!checking && (
        <Pressable onPress={guard.cancel} style={styles.link}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SignIn({
  error,
  onSignIn,
}: {
  error: string | null;
  onSignIn: (
    credentials: SteamCredentials,
    steamGuard: SteamGuardHandler,
  ) => Promise<void>;
}) {
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [guard, setGuard] = useState<GuardRequest | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const guardCount = useRef(0);
  const ready = accountName.trim() !== '' && password !== '';

  const steamGuard: SteamGuardHandler = (prompt) =>
    new Promise((resolve, reject) => {
      setGuard({
        id: ++guardCount.current,
        prompt,
        answer: resolve,
        cancel: () => reject(new Error('Sign-in cancelled')),
      });
    });

  async function signIn() {
    if (!ready) return;
    setBusy(true);
    try {
      await onSignIn({ accountName: accountName.trim(), password }, steamGuard);
    } finally {
      setGuard(null);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {guard ? (
          <SteamGuard key={guard.id} guard={guard} />
        ) : (
          <View style={styles.form}>
            <Logo />
            <View style={styles.fields}>
              <Text style={[styles.label, { color: colors.accent }]}>
                SIGN IN WITH ACCOUNT NAME
              </Text>
              <Field
                value={accountName}
                onChangeText={setAccountName}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                submitBehavior="submit"
              />
              <Text style={styles.label}>PASSWORD</Text>
              <Field
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={signIn}
              />
            </View>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            )}
            <GradientButton
              title="Sign in"
              busy={busy}
              disabled={!ready}
              onPress={signIn}
            />
            <Text style={styles.footnote}>
              You sign in to Steam directly, your password goes to Steam and
              nowhere else.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  form: { gap: 16, width: '100%', maxWidth: 420, alignSelf: 'center' },
  fields: { gap: 8, marginTop: 24 },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  title: {
    color: colors.bright,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  guardIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 159, 255, 0.12)',
  },
  code: {
    height: 64,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { flex: 1, color: colors.danger, fontSize: 14 },
  centered: { textAlign: 'center' },
  link: { alignSelf: 'center', padding: 8 },
  linkText: { color: colors.muted, fontSize: 16 },
  footnote: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
