import Ionicons from '@expo/vector-icons/Ionicons';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import { SignInPrompt } from '../components/SignInPrompt';
import { type Tab, TabBar } from '../components/TabBar';
import { Toast } from '../components/Toast';
import { colors } from '../theme';
import { FeedTabs } from './FeedTabs';
import { PageScreen } from './PageScreen';
import { navigationTheme, type Routes, Stack, usePages } from './stack';

/**
 * Home without an account: the store, releases and sale events anyone sees. The user's own
 * lists, news, friends' activity and chat ask to sign in.
 */
export function GuestHome({
  feeds,
  onSignIn,
}: {
  feeds: SteamFeeds;
  onSignIn: () => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigationContainerRef<Routes>();
  const [tab, setTab] = useState<Tab>('store');
  const [error, setError] = useState<string | null>(null);
  const showError = useCallback((err: Error) => setError(err.message), []);
  const dismissError = useCallback(() => setError(null), []);
  const { push, openGame, back } = usePages(navigation);

  const tabs = (
    <View style={styles.grow}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.grow, styles.name]}>Vaporlens</Text>
        <Pressable
          onPress={onSignIn}
          hitSlop={8}
          style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
        >
          <Ionicons name="log-in-outline" size={20} color={colors.accent} />
          <Text style={styles.signInText}>Sign in</Text>
        </Pressable>
      </View>
      <FeedTabs
        feeds={feeds}
        voice={null}
        onSignIn={onSignIn}
        tab={tab}
        onOpenGame={openGame}
        onOpenPage={push}
        onError={showError}
      />
      {tab === 'chat' && (
        <SignInPrompt
          message="Sign in with Steam to chat with your friends and groups and join voice."
          onSignIn={onSignIn}
        />
      )}
      <TabBar tab={tab} onChange={setTab} bottomInset={insets.bottom} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <NavigationContainer ref={navigation} theme={navigationTheme}>
        <Stack.Navigator
          // covered screens skip renders until they show again
          screenOptions={{ headerShown: false, freezeOnBlur: true }}
        >
          <Stack.Screen name="tabs">{() => tabs}</Stack.Screen>
          <Stack.Screen name="page">
            {({ route }) => (
              <PageScreen
                feeds={feeds}
                page={route.params.page}
                onBack={back}
                onOpenGame={openGame}
                onOpenPage={push}
                onError={showError}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
      <Toast message={error} onDismiss={dismissError} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.bar,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  grow: { flex: 1 },
  name: { color: colors.bright, fontSize: 20, fontWeight: '800' },
  signIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  signInText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
