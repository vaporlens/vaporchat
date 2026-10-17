import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatAlerts, ChatGroup } from 'vaporchat/protocol';
import { InfoSheet } from '../components/InfoSheet';
import { colors } from '../theme';

const OPTIONS: { alerts: ChatAlerts; label: string; detail: string }[] = [
  { alerts: 'all', label: 'All messages', detail: 'Every message alerts' },
  {
    alerts: 'mentions',
    label: 'Mentions',
    detail: 'Messages that mention you or everyone',
  },
  { alerts: 'none', label: 'Nothing', detail: 'No alerts from this group' },
];

/** A bell, crossed out when the chat doesn't alert. */
export function AlertsButton({
  off,
  onPress,
}: {
  off: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={off ? 'Alerts off' : 'Alerts'}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons
        name={off ? 'notifications-off-outline' : 'notifications-outline'}
        size={22}
        color={colors.muted}
      />
    </Pressable>
  );
}

/** Picks which of a group's messages alert, Steam's setting for all of the account's phones. */
export function GroupAlertsButton({
  group,
  onChange,
}: {
  group: ChatGroup;
  onChange: (alerts: ChatAlerts) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AlertsButton
        off={group.alerts === 'none'}
        onPress={() => setOpen(true)}
      />
      <InfoSheet
        info={
          open
            ? {
                title: 'Alerts',
                subtitle: group.name,
                body: (
                  <View style={styles.list}>
                    {OPTIONS.map(({ alerts, label, detail }) => (
                      <Pressable
                        key={alerts}
                        onPress={() => {
                          setOpen(false);
                          if (alerts !== group.alerts) onChange(alerts);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{
                          selected: alerts === group.alerts,
                        }}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.grow}>
                          <Text style={styles.label}>{label}</Text>
                          <Text style={styles.detail}>{detail}</Text>
                        </View>
                        {alerts === group.alerts && (
                          <Ionicons
                            name="checkmark"
                            size={22}
                            color={colors.accent}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                ),
              }
            : null
        }
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
  pressed: { opacity: 0.6 },
  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  grow: { flex: 1 },
  label: { color: colors.bright, fontSize: 16 },
  detail: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
