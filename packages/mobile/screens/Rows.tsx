import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatGroup, ChatRoom, Friend } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';

const SHOWN_IN_VOICE = 4;

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title}
        {count !== undefined && (
          <Text style={styles.sectionCount}> ({count})</Text>
        )}
      </Text>
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

export function RoomRow({
  group,
  room,
  inVoice,
  connected,
  unread,
  onOpen,
  onJoin,
}: {
  group: ChatGroup;
  room: ChatRoom;
  /** the people in its voice chat */
  inVoice: Friend[];
  connected: boolean;
  unread: number;
  onOpen: () => void;
  onJoin: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        connected && styles.cardConnected,
        pressed && styles.pressed,
      ]}
    >
      <Avatar url={group.avatarUrl} name={group.name} size={48} />
      <View style={styles.grow}>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.name}
        </Text>
        <View style={styles.roomName}>
          <Ionicons
            name={room.voiceAllowed ? 'volume-medium' : 'chatbubble-outline'}
            size={16}
            color={colors.text}
          />
          <Text style={styles.name} numberOfLines={1}>
            {room.name}
          </Text>
        </View>
        {room.voiceAllowed && (
          <View style={styles.inVoice}>
            {inVoice.slice(0, SHOWN_IN_VOICE).map((person) => (
              <Avatar
                key={person.steamid}
                url={person.avatarUrl}
                name={person.name}
                size={20}
              />
            ))}
            <Text style={styles.sub}>
              {inVoice.length === 0
                ? 'Nobody in voice'
                : `${inVoice.length} in voice`}
            </Text>
          </View>
        )}
      </View>
      <UnreadBadge count={unread} />
      {connected ? (
        <View style={[styles.pill, styles.pillConnected]}>
          <Text style={[styles.pillText, { color: colors.speaking }]}>
            Connected
          </Text>
        </View>
      ) : (
        room.voiceAllowed && (
          <Pressable
            onPress={onJoin}
            accessibilityLabel={`Join voice in ${room.name}`}
            hitSlop={8}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Text style={styles.pillText}>Join</Text>
          </Pressable>
        )
      )}
    </Pressable>
  );
}

export function FriendRow({
  friend,
  inCall,
  unread,
  onOpen,
  onCall,
}: {
  friend: Friend;
  inCall: boolean;
  unread: number;
  onOpen: () => void;
  onCall: () => void;
}) {
  const status = friend.online ? colors.online : colors.offline;
  return (
    <Pressable
      onPress={onOpen}
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
          {inCall ? 'In call' : friend.online ? 'Online' : 'Offline'}
        </Text>
      </View>
      <UnreadBadge count={unread} />
      {friend.online && !inCall && (
        <Pressable
          onPress={onCall}
          accessibilityLabel={`Call ${friend.name}`}
          hitSlop={8}
          style={({ pressed }) => [styles.call, pressed && styles.pressed]}
        >
          <Ionicons name="call" size={18} color={colors.bright} />
        </Pressable>
      )}
    </Pressable>
  );
}

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
  groupName: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roomName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  inVoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  sub: { color: colors.muted, fontSize: 13, marginLeft: 2 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(26, 159, 255, 0.15)',
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
  call: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
