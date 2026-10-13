import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SteamFeeds } from 'vaporchat/client/feeds';
import { retryDelay } from 'vaporchat/client/retryPolicy';
import { SteamVoice } from 'vaporchat/client/steamVoice';
import type { SteamGuardHandler } from 'vaporchat/steam/credentialLogin';
import type { SteamCredentials } from 'vaporchat/steam/logOn';
import { cacheStore, clearCache, openCache } from './cache';
import { Appear } from './components/Appear';
import { Logo } from './components/Logo';
import { GuestHome } from './screens/GuestHome';
import { Home, type Link } from './screens/Home';
import { SignIn } from './screens/SignIn';
import { colors, gradients } from './theme';
import { tokenStore } from './tokenStore';
import { UserAppsProvider } from './userApps';

type State =
  /** reading the stored token */
  | { kind: 'starting' }
  /** the store anyone sees, with the sign-in screen over it while `signingIn` */
  | { kind: 'signedOut'; signingIn: boolean; error: string | null }
  /** Home shows what was cached while `link` isn't online */
  | { kind: 'signedIn'; voice: SteamVoice; link: Link };

// the device's preferred language, sale events show in it. Not `Intl`'s, which iOS keeps to the
// languages the app itself is translated to (english)
const locale = getLocales()[0]?.languageTag ?? 'en';
const guestFeeds = SteamFeeds.anonymous(locale);

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'starting' });

  /** Shows the store anyone sees, the sign-in screen over it while `signingIn`. */
  function signedOut(signingIn: boolean, error: string | null = null) {
    setState({ kind: 'signedOut', signingIn, error });
  }

  /** Changes how `voice` is connected, unless it was replaced (signed out, reconnected) meanwhile. */
  function setLink(voice: SteamVoice, link: Link) {
    setState((current) =>
      current.kind === 'signedIn' && current.voice === voice
        ? { ...current, link }
        : current,
    );
  }

  function signedIn(voice: SteamVoice, link: Link) {
    openCache(voice.me.steamid);
    voice.connection.on('close', ({ reason }) =>
      setLink(voice, { kind: 'lost', reason, failures: 0 }),
    );
    setState({ kind: 'signedIn', voice, link });
  }

  /**
   * Logs on with the stored token while Home shows what was cached, the store anyone sees is for
   * when there is none (or it stopped working).
   */
  async function connect(failures = 0) {
    if (!(await tokenStore.load())) {
      signedOut(false);
      return;
    }
    let voice: SteamVoice;
    try {
      voice = await SteamVoice.start(tokenStore, { locale, cache: cacheStore });
    } catch (err) {
      // an unreadable stored token, signing in again replaces it
      await tokenStore.clear();
      signedOut(true, message(err));
      clearCache();
      return;
    }
    signedIn(voice, { kind: 'connecting' });
    try {
      await voice.connection.ready;
      setLink(voice, { kind: 'online' });
    } catch (err) {
      // a rejected token was cleared, everything else (offline, steam down) is worth retrying
      if (await tokenStore.load()) {
        setLink(voice, {
          kind: 'lost',
          reason: message(err),
          failures: failures + 1,
        });
      } else {
        signedOut(true, 'Steam signed you out, please sign in again.');
        clearCache();
      }
    }
  }

  async function signIn(
    credentials: SteamCredentials,
    steamGuard: SteamGuardHandler,
  ) {
    try {
      const voice = await SteamVoice.logOn(tokenStore, {
        locale,
        cache: cacheStore,
        credentials,
        steamGuard,
      });
      signedIn(voice, { kind: 'online' });
    } catch (err) {
      signedOut(true, message(err));
    }
  }

  async function signOut(voice: SteamVoice) {
    signedOut(false);
    // the next account must not see this one's chats
    clearCache();
    // leaving can fail on a dying connection, steam drops the stale voice session then
    await voice.session?.leave().catch(() => {});
    voice.connection.close();
    await tokenStore.clear();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: connects once, at launch
  useEffect(() => {
    void connect();
  }, []);

  // lost connections come back on their own, and right away when the app is opened again
  const failures =
    state.kind === 'signedIn' && state.link.kind === 'lost'
      ? state.link.failures
      : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns per failed attempt only
  useEffect(() => {
    if (failures === null) return;
    const timer = setTimeout(
      () => void connect(failures),
      retryDelay(failures),
    );
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState !== 'active') return;
      clearTimeout(timer);
      void connect(failures);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [failures]);

  return (
    <SafeAreaProvider style={styles.container}>
      {state.kind === 'starting' && (
        <View style={styles.center}>
          <Logo />
        </View>
      )}
      {state.kind === 'signedOut' && (
        <>
          <Appear style={styles.screen}>
            <GuestHome feeds={guestFeeds} onSignIn={() => signedOut(true)} />
          </Appear>
          {/* over the store, which stays as it was for going back to */}
          {state.signingIn && (
            <Appear style={[StyleSheet.absoluteFill, styles.container]}>
              <SignIn
                error={state.error}
                onSignIn={signIn}
                onCancel={() => signedOut(false)}
              />
            </Appear>
          )}
        </>
      )}
      {state.kind === 'signedIn' && (
        <Appear style={styles.screen}>
          <UserAppsProvider voice={state.voice}>
            <Home
              voice={state.voice}
              link={state.link}
              onReconnect={() =>
                state.link.kind === 'lost' && connect(state.link.failures)
              }
              onSignOut={() => signOut(state.voice)}
            />
          </UserAppsProvider>
        </Appear>
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
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
  },
});
