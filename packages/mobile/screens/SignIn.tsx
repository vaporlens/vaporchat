import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  SteamGuardHandler,
  SteamGuardPrompt,
} from 'vaporchat/steam/credentialLogin';
import type { SteamCredentials } from 'vaporchat/steam/logOn';
import { useColors } from '../colors';

interface GuardRequest {
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
  const colors = useColors();
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [guard, setGuard] = useState<GuardRequest | null>(null);

  const steamGuard: SteamGuardHandler = (prompt) =>
    new Promise((resolve, reject) => {
      setCode('');
      setGuard({
        prompt,
        answer: resolve,
        cancel: () => reject(new Error('Sign-in cancelled')),
      });
    });

  async function signIn() {
    setBusy(true);
    try {
      await onSignIn({ accountName: accountName.trim(), password }, steamGuard);
    } finally {
      setGuard(null);
      setBusy(false);
    }
  }

  const input = [
    styles.input,
    { color: colors.text, borderColor: colors.border },
  ];

  if (guard) {
    return (
      <View style={styles.form}>
        <Text style={[styles.title, { color: colors.text }]}>Steam Guard</Text>
        <Text style={{ color: colors.text }}>{guardMessage(guard.prompt)}</Text>
        {guard.prompt.lastCodeWrong && (
          <Text style={{ color: colors.error }}>
            That code was wrong, try again.
          </Text>
        )}
        {guard.prompt.codeType && (
          <>
            <TextInput
              style={input}
              value={code}
              onChangeText={setCode}
              placeholder="Code"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            <Button
              title="Submit code"
              disabled={code.trim() === ''}
              onPress={() => {
                guard.answer(code.trim());
                setGuard(null);
              }}
            />
          </>
        )}
        <Button title="Cancel" onPress={guard.cancel} />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={[styles.title, { color: colors.text }]}>
        Sign in to Steam
      </Text>
      <TextInput
        style={input}
        value={accountName}
        onChangeText={setAccountName}
        placeholder="Account name"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
      />
      <TextInput
        style={input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        textContentType="password"
        onSubmitEditing={signIn}
      />
      <Button
        title={busy ? 'Signing in…' : 'Sign in'}
        disabled={busy || accountName.trim() === '' || password === ''}
        onPress={signIn}
      />
      {error && <Text style={{ color: colors.error }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
});
