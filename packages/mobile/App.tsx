import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { retryDelay } from 'vaporchat/client/retryPolicy';
import { SteamVoice } from 'vaporchat/client/steamVoice';
import type { SteamGuardHandler } from 'vaporchat/steam/credentialLogin';
import type { SteamCredentials } from 'vaporchat/steam/logOn';
import { GradientButton } from './components/GradientButton';
import { Logo } from './components/Logo';
import { Home } from './screens/Home';
import { SignIn } from './screens/SignIn';
import { colors, gradients } from './theme';
import { tokenStore } from './tokenStore';

type State =
  | { kind: 'connecting' }
  | { kind: 'signedOut'; error: string | null }
  /** retried on its own, with backoff after `failures` failed attempts */
  | { kind: 'disconnected'; reason: string; failures: number }
  | { kind: 'signedIn'; voice: SteamVoice };

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'connecting' });

  function signedIn(voice: SteamVoice) {
    voice.connection.on('close', ({ reason }) =>
      // signing out closes the connection too, that state is already set
      setState((current) =>
        current.kind === 'signedIn' && current.voice === voice
          ? { kind: 'disconnected', reason, failures: 0 }
          : current,
      ),
    );
    setState({ kind: 'signedIn', voice });
  }

  /** Logs on with the stored token, the sign-in screen is for when there is none (or it stopped working). */
  async function reconnect(failures = 0) {
    setState({ kind: 'connecting' });
    if (!(await tokenStore.load())) {
      setState({ kind: 'signedOut', error: null });
      return;
    }
    try {
      signedIn(await SteamVoice.logOn(tokenStore));
    } catch (err) {
      const hasToken = (await tokenStore.load()) !== null;
      // a rejected token was cleared, everything else (offline, steam down) is worth retrying
      setState(
        hasToken
          ? {
              kind: 'disconnected',
              reason: message(err),
              failures: failures + 1,
            }
          : {
              kind: 'signedOut',
              error: 'Steam signed you out, please sign in again.',
            },
      );
    }
  }

  async function signIn(
    credentials: SteamCredentials,
    steamGuard: SteamGuardHandler,
  ) {
    try {
      signedIn(await SteamVoice.logOn(tokenStore, { credentials, steamGuard }));
    } catch (err) {
      setState({ kind: 'signedOut', error: message(err) });
    }
  }

  async function signOut(voice: SteamVoice) {
    setState({ kind: 'signedOut', error: null });
    // leaving can fail on a dying connection, steam drops the stale voice session then
    await voice.session?.leave().catch(() => {});
    voice.connection.close();
    await tokenStore.clear();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: connects once, at launch
  useEffect(() => {
    void reconnect();
  }, []);

  // lost connections come back on their own, and right away when the app is opened again
  const failures = state.kind === 'disconnected' ? state.failures : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns per failed attempt only
  useEffect(() => {
    if (failures === null) return;
    const timer = setTimeout(
      () => void reconnect(failures),
      retryDelay(failures),
    );
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState !== 'active') return;
      clearTimeout(timer);
      void reconnect(failures);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [failures]);

  return (
    <SafeAreaProvider style={styles.container}>
      {state.kind === 'connecting' && (
        <View style={styles.center}>
          <Logo />
          <View style={styles.status}>
            <ActivityIndicator color={colors.muted} />
            <Text style={styles.statusText}>Connecting to Steam…</Text>
          </View>
        </View>
      )}
      {state.kind === 'signedOut' && (
        <SignIn error={state.error} onSignIn={signIn} />
      )}
      {state.kind === 'disconnected' && (
        <View style={styles.center}>
          <Logo />
          <View style={styles.status}>
            <ActivityIndicator color={colors.muted} />
            <Text style={styles.statusText}>Reconnecting to Steam…</Text>
          </View>
          <Text style={styles.reason}>{state.reason}</Text>
          <GradientButton
            title="Reconnect now"
            onPress={() => reconnect(state.failures)}
          />
        </View>
      )}
      {state.kind === 'signedIn' && (
        <Home voice={state.voice} onSignOut={() => signOut(state.voice)} />
      )}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    experimental_backgroundImage: gradients.screen,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { color: colors.muted, fontSize: 15 },
  reason: { color: colors.offline, fontSize: 13, textAlign: 'center' },
});
