import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { MyStatus, NewsSource } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { DetailHeader } from '../components/DetailHeader';
import { SectionTitle } from '../components/SectionTitle';
import { colors } from '../theme';
import { type SavedAccount, savedAccounts } from '../tokenStore';
import { importSteamGames, type VaporlensAnswer } from '../vaporlens';

/** Each status with what it means for friends and its color, the header and member list show the same. */
export const STATUSES: Record<
  MyStatus,
  { label: string; detail: string; color: string }
> = {
  online: {
    label: 'Online',
    detail: 'Friends see you online',
    color: colors.online,
  },
  away: { label: 'Away', detail: 'Friends see you away', color: colors.away },
  invisible: {
    label: 'Invisible',
    detail: 'You look offline, and can still chat',
    color: colors.offline,
  },
};

/** The games and groups whose news is muted in the feed, unmuting them. Nothing while none. */
function MutedNews({
  feeds,
  onError,
}: {
  feeds: SteamFeeds;
  onError: (err: Error) => void;
}) {
  const [sources, setSources] = useState<NewsSource[]>([]);
  useEffect(() => {
    let shown = true;
    feeds
      .getMutedNewsSources()
      .then((loaded) => shown && setSources(loaded))
      // steam didn't say: the settings work without
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [feeds]);
  if (sources.length === 0) return null;

  const unmute = (source: NewsSource) =>
    feeds
      .setNewsSourceMuted(source, false)
      .then(() => setSources((all) => all.filter((s) => s !== source)))
      .catch(onError);
  return (
    <>
      <SectionTitle title="Muted news" />
      <View style={styles.group}>
        {sources.map((source) => (
          <View key={`${source.kind}-${source.id}`} style={styles.row}>
            <Text style={[styles.label, styles.grow]} numberOfLines={1}>
              {source.name}
            </Text>
            <Pressable
              onPress={() => unmute(source)}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.action}>Unmute</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

/** Has vaporlens.app import the library and wishlist, the library makes the taste profile. */
function VaporlensImport() {
  const [answers, setAnswers] = useState<VaporlensAnswer[]>([]);
  const [importing, setImporting] = useState(false);
  const run = () => {
    setImporting(true);
    Promise.all([importSteamGames('library'), importSteamGames('wishlist')])
      .then(setAnswers)
      .finally(() => setImporting(false));
  };
  const [library, wishlist] = answers;
  // the taste profile failed or got no game: the server says why, in place of the counts
  const unprofiled = library?.imported !== undefined && !library.profiled;
  const summary = unprofiled
    ? ''
    : [
        library?.imported !== undefined && `Library ${library.imported}`,
        wishlist?.imported !== undefined && `Wishlist ${wishlist.imported}`,
        library?.profiled !== undefined &&
          `${library.profiled} in taste profile`,
      ]
        .filter(Boolean)
        .join(' · ');
  // signed out, both say so: once is enough
  const errors = [
    ...new Set([
      ...answers.flatMap((answer) => answer.error ?? []),
      ...(unprofiled && library.message ? [library.message] : []),
    ]),
  ];
  return (
    <>
      <SectionTitle title="VaporLens" />
      <View style={styles.group}>
        <Pressable
          disabled={importing}
          onPress={run}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.grow}>
            <Text style={styles.label}>Import library and wishlist</Text>
            {summary === '' && errors.length === 0 && (
              <Text style={styles.detail}>
                VaporLens reads them from your public Steam profile
              </Text>
            )}
            {summary !== '' && <Text style={styles.detail}>{summary}</Text>}
            {errors.map((error) => (
              <Text key={error} style={[styles.detail, styles.danger]}>
                {error}
              </Text>
            ))}
          </View>
          {importing && <ActivityIndicator color={colors.muted} />}
        </Pressable>
      </View>
    </>
  );
}

/** What friends see of you, alerts in the background, muted news, VaporLens imports, and accounts. */
export function SettingsScreen({
  feeds,
  status,
  onChangeStatus,
  stayConnected,
  onChangeStayConnected,
  onSwitchAccount,
  onSignOut,
  onError,
  onBack,
}: {
  feeds: SteamFeeds;
  status: MyStatus;
  onChangeStatus: (status: MyStatus) => void;
  /** null where the app can't stay connected in the background (iOS) */
  stayConnected: boolean | null;
  onChangeStayConnected: (on: boolean) => void;
  /** to an account signed in here before, or signing in to another with null */
  onSwitchAccount: (steamid: string | null) => void;
  onSignOut: () => void;
  onError: (err: Error) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  useEffect(() => {
    savedAccounts().then(setAccounts, () => {});
  }, []);
  return (
    <View style={styles.screen}>
      <DetailHeader title="Settings" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        <SectionTitle title="Status" />
        <View style={styles.group}>
          {(Object.keys(STATUSES) as MyStatus[]).map((option) => {
            const { label, detail, color } = STATUSES[option];
            const selected = option === status;
            return (
              <Pressable
                key={option}
                onPress={() => onChangeStatus(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={[styles.dot, { backgroundColor: color }]} />
                <View style={styles.grow}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.detail}>{detail}</Text>
                </View>
                {selected && (
                  <Ionicons name="checkmark" size={22} color={colors.accent} />
                )}
              </Pressable>
            );
          })}
        </View>
        {stayConnected !== null && (
          <>
            <SectionTitle title="Notifications" />
            <View style={styles.group}>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <Text style={styles.label}>Stay connected</Text>
                  <Text style={styles.detail}>
                    Alerts for messages and calls while Vaporlens is in the
                    background. Uses more battery
                  </Text>
                </View>
                <Switch
                  value={stayConnected}
                  onValueChange={onChangeStayConnected}
                  trackColor={{ true: colors.accent }}
                />
              </View>
            </View>
          </>
        )}
        <MutedNews feeds={feeds} onError={onError} />
        <VaporlensImport />
        <SectionTitle title="Account" />
        <View style={styles.group}>
          {accounts.map((account) => (
            <Pressable
              key={account.steamid}
              onPress={() => onSwitchAccount(account.steamid)}
              accessibilityHint="Switches to this account"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Avatar url={account.avatarUrl} name={account.name} size={28} />
              <Text style={[styles.label, styles.grow]} numberOfLines={1}>
                {account.name}
              </Text>
              <Text style={styles.action}>Switch</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => onSwitchAccount(null)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Ionicons name="person-add-outline" size={22} color={colors.text} />
            <Text style={styles.label}>Add account</Text>
          </Pressable>
          <Pressable
            onPress={onSignOut}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
            <Text style={[styles.label, styles.danger]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  group: {
    marginBottom: 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: { opacity: 0.6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  grow: { flex: 1 },
  label: { color: colors.bright, fontSize: 16 },
  detail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  danger: { color: colors.danger },
  action: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
