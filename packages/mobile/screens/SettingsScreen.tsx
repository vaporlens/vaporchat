import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MyStatus } from 'vaporchat/protocol';
import { DetailHeader } from '../components/DetailHeader';
import { SectionTitle } from '../components/SectionTitle';
import { colors } from '../theme';

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

/** What friends see of you, alerts in the background, and signing out. */
export function SettingsScreen({
  status,
  onChangeStatus,
  stayConnected,
  onChangeStayConnected,
  onSignOut,
  onBack,
}: {
  status: MyStatus;
  onChangeStatus: (status: MyStatus) => void;
  /** null where the app can't stay connected in the background (iOS) */
  stayConnected: boolean | null;
  onChangeStayConnected: (on: boolean) => void;
  onSignOut: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
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
        <SectionTitle title="Account" />
        <View style={styles.group}>
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
});
