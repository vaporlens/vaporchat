import Ionicons from '@expo/vector-icons/Ionicons';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import { SearchButton } from '../components/SearchButton';
import { SignInPrompt } from '../components/SignInPrompt';
import { type Tab, TabBar } from '../components/TabBar';
import { Toast } from '../components/Toast';
import { colors } from '../theme';
import { FeedTabs } from './FeedTabs';
import { PageScreen } from './PageScreen';
import { GuestSettingsScreen } from './SettingsScreen';
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
  const [topTaps, setTopTaps] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  // tells the search button whether the list shown has a search bar
  const searchButton = useRef<(searchable: boolean) => void>(null);
  const setSearchable = useCallback(
    (searchable: boolean) => searchButton.current?.(searchable),
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const showError = useCallback((err: Error) => setError(err.message), []);
  const dismissError = useCallback(() => setError(null), []);
  const { push, openGame, back } = usePages(navigation);

  const tabs = (
    <View style={styles.grow}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.grow, styles.name]}>Vaporlens</Text>
        <SearchButton
          ref={searchButton}
          // chat is a sign-in prompt
          shown={tab === 'chat' ? false : undefined}
          open={searchOpen}
          onPress={() => setSearchOpen(!searchOpen)}
          style={styles.headerButton}
        />
        <Pressable
          onPress={() => navigation.navigate('settings')}
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="settings-outline" size={22} color={colors.muted} />
        </Pressable>
        <Pressable
          onPress={onSignIn}
          hitSlop={8}
          style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
        >
          <Ionicons name="logo-steam" size={20} color={colors.accent} />
          <Text style={styles.signInText}>Sign in</Text>
        </Pressable>
      </View>
      <FeedTabs
        feeds={feeds}
        voice={null}
        onSignIn={onSignIn}
        tab={tab}
        topTaps={topTaps}
        onOpenGame={openGame}
        onOpenPage={push}
        onError={showError}
        searchOpen={searchOpen}
        onCloseSearch={closeSearch}
        onSearchable={setSearchable}
      />
      {tab === 'chat' && (
        <SignInPrompt
          message="Sign in with Steam to chat with your friends and groups and join voice."
          onSignIn={onSignIn}
        />
      )}
      <TabBar
        tab={tab}
        onChange={(picked) => {
          setTab(picked);
          // tapping the tab shown keeps it open and scrolls its list to the top
          if (picked !== tab) setSearchOpen(false);
          else setTopTaps(topTaps + 1);
        }}
        bottomInset={insets.bottom}
      />
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
          <Stack.Screen name="settings">
            {() => <GuestSettingsScreen onBack={back} />}
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
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
});
