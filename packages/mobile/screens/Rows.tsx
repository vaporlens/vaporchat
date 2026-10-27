import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatGroup, ChatTarget, Friend } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { friendStatus } from '../format';
import { colors } from '../theme';

const SHOWN_IN_VOICE = 4;

export function SectionHeader({
  title,
  count,
  action,
  onPress,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  /** the title opens what it names, like a game's page */
  onPress?: () => void;
}) {
  const text = (
    <Text style={styles.sectionTitle}>
      {title}
      {count !== undefined && (
        <Text style={styles.sectionCount}> ({count})</Text>
      )}
    </Text>
  );
  return (
    <View style={styles.sectionHeader}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="link"
          hitSlop={10}
          style={({ pressed }) => [
            styles.sectionLink,
            pressed && styles.pressed,
          ]}
        >
          {text}
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </Pressable>
      ) : (
        text
      )}
      {action}
    </View>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.unread}>
      <Text style={styles.unreadText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

/** Who is in a voice chat: the first few avatars and how many. */
export function InVoice({ people, size }: { people: Friend[]; size: number }) {
  return (
    <View style={styles.inVoice}>
      {people.slice(0, SHOWN_IN_VOICE).map((person) => (
        <Avatar
          key={person.steamid}
          url={person.avatarUrl}
          name={person.name}
          size={size}
        />
      ))}
      <Text style={styles.sub} numberOfLines={1}>
        {people.length === 0 ? 'Nobody in voice' : `${people.length} in voice`}
      </Text>
    </View>
  );
}

/** Connected while you are in the voice chat, Join otherwise. */
export function VoicePill({
  connected,
  onJoin,
  accessibilityLabel,
}: {
  connected: boolean;
  onJoin?: () => void;
  accessibilityLabel?: string;
}) {
  if (connected)
    return (
      <View style={[styles.pill, styles.pillConnected]}>
        <Text style={[styles.pillText, { color: colors.speaking }]}>
          Connected
        </Text>
      </View>
    );
  return (
    <Pressable
      onPress={onJoin}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Text style={styles.pillText}>Join</Text>
    </Pressable>
  );
}

/**
 * A group chat: opens its chat, which has its voice channels on top. Memoized, the list
 * renders again for every unread message.
 */
export const GroupRow = memo(function GroupRow({
  group,
  chat,
  inVoice,
  connected,
  unread,
  onOpen,
}: {
  group: ChatGroup;
  /** what opening it opens */
  chat: ChatTarget;
  /** the people in its voice channels */
  inVoice: Friend[];
  connected: boolean;
  /** any of its rooms, steam doesn't count a room's unread messages */
  unread: boolean;
  onOpen: (chat: ChatTarget) => void;
}) {
  const hasVoice = group.rooms.some((room) => room.voiceAllowed);
  return (
    <Pressable
      onPress={() => onOpen(chat)}
      accessibilityLabel={[
        group.name,
        hasVoice && `${inVoice.length} in voice`,
        unread && 'unread',
        connected && 'connected',
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [
        styles.card,
        connected && styles.cardConnected,
        pressed && styles.pressed,
      ]}
    >
      <Avatar url={group.avatarUrl} name={group.name} size={48} />
      <View style={styles.grow}>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        {hasVoice && <InVoice people={inVoice} size={20} />}
      </View>
      {unread && <View style={styles.unreadDot} />}
      {connected && <VoicePill connected />}
    </Pressable>
  );
});

/** A friend: opens their chat, calls them while online. Memoized like `GroupRow`. */
export const FriendRow = memo(function FriendRow({
  friend,
  inCall,
  unread,
  onOpen,
  onCall,
}: {
  friend: Friend;
  inCall: boolean;
  unread: number;
  onOpen: (chat: ChatTarget) => void;
  onCall: (friend: Friend) => void;
}) {
  const status = !friend.online
    ? colors.offline
    : friend.game
      ? colors.inGame
      : friend.away
        ? colors.away
        : colors.online;
  return (
    <Pressable
      onPress={() => onOpen({ kind: 'friend', steamid: friend.steamid })}
      accessibilityLabel={[
        friend.name,
        inCall ? 'In call' : friendStatus(friend),
        unread > 0 && `${unread} unread`,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [
        styles.row,
        !friend.online && styles.offline,
        pressed && styles.pressed,
      ]}
    >
      <Avatar
        url={friend.avatarUrl}
        name={friend.name}
        size={40}
        frame={status}
      />
      <View style={styles.grow}>
        <Text style={[styles.name, { color: status }]} numberOfLines={1}>
          {friend.name}
        </Text>
        <Text
          style={[styles.sub, inCall && { color: colors.speaking }]}
          numberOfLines={1}
        >
          {inCall ? 'In call' : friendStatus(friend)}
        </Text>
      </View>
      <UnreadBadge count={unread} />
      {friend.online && !inCall && (
        <Pressable
          onPress={() => onCall(friend)}
          accessibilityLabel={`Call ${friend.name}`}
          hitSlop={8}
          style={({ pressed }) => [styles.call, pressed && styles.pressed]}
        >
          <Ionicons name="call" size={18} color={colors.bright} />
        </Pressable>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionCount: { color: colors.offline, fontWeight: '500' },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardConnected: { borderColor: colors.speaking },
  pressed: { opacity: 0.7 },
  grow: { flex: 1, gap: 2 },
  name: { flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  inVoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  sub: { flexShrink: 1, color: colors.muted, fontSize: 13, marginLeft: 2 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.accentBackground,
  },
  pillConnected: { backgroundColor: 'rgba(111, 209, 75, 0.15)' },
  pillText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offline: { opacity: 0.6 },
  unread: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  unreadText: { color: colors.bright, fontSize: 12, fontWeight: '700' },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  call: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
