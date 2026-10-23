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
import type { MyStatus } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { DetailHeader } from '../components/DetailHeader';
import { SectionTitle } from '../components/SectionTitle';
import { colors } from '../theme';
import { type SavedAccount, savedAccounts } from '../tokenStore';
import { useHiddenInStore } from '../userApps';
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

const HIDDEN_OPTIONS = [
  { kind: 'owned', label: 'Hide games in your library' },
  { kind: 'wishlisted', label: 'Hide wishlisted games' },
] as const;

/** Leaving the user's games out of the store's lists, searches still find them. */
function HiddenInStore() {
  const { hidden, setHidden } = useHiddenInStore();
  return (
    <>
      <SectionTitle title="Store" />
      <View style={styles.group}>
        {HIDDEN_OPTIONS.map(({ kind, label }) => (
          <View key={kind} style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.detail}>
                In the store's lists, searches still show them
              </Text>
            </View>
            <Switch
              value={hidden[kind]}
              onValueChange={(on) => setHidden({ ...hidden, [kind]: on })}
              trackColor={{ true: colors.accent }}
            />
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

/**
 * What friends see of you, alerts in the background, games hidden in the store, VaporLens
 * imports, and accounts.
 */
export function SettingsScreen({
  status,
  onChangeStatus,
  stayConnected,
  onChangeStayConnected,
  onSwitchAccount,
  onSignOut,
  onBack,
}: {
  status: MyStatus;
  onChangeStatus: (status: MyStatus) => void;
  /** null where the app can't stay connected in the background (iOS) */
  stayConnected: boolean | null;
  onChangeStayConnected: (on: boolean) => void;
  /** to an account signed in here before, or signing in to another with null */
  onSwitchAccount: (steamid: string | null) => void;
  onSignOut: () => void;
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
        <HiddenInStore />
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
