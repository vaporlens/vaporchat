import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import type { ChatGroup, ChatRoom, Friend } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { Field } from '../components/Field';
import { Toast } from '../components/Toast';
import { colors } from '../theme';
import { startVoice, useVoice } from '../voice';
import { CallDock } from './CallDock';
import { IncomingCall } from './IncomingCall';
import { JoinGroup } from './JoinGroup';
import { FriendRow, RoomRow, SectionHeader } from './Rows';

type Row =
  | { kind: 'room'; key: string; group: ChatGroup; room: ChatRoom }
  | { kind: 'friend'; key: string; friend: Friend };

interface Section {
  key: 'rooms' | 'online' | 'offline';
  title: string;
  count?: number;
  data: Row[];
}

function sessionTitle(
  voice: SteamVoice,
  session: VoiceSession,
  groups: ChatGroup[],
) {
  const { target } = session;
  if (target.kind === 'friend')
    return voice.connection.user(target.steamid).name;
  const group = groups.find((g) => g.groupId === target.groupId);
  const room = group?.rooms.find((r) => r.chatId === target.chatId);
  return `${group?.name ?? 'Group'} › ${room?.name ?? 'voice'}`;
}

function matches(query: string, ...names: string[]) {
  const q = query.trim().toLowerCase();
  return q === '' || names.some((name) => name.toLowerCase().includes(q));
}

const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name);

/** Who you are, your group voice rooms and your friends. Tap a room to join, call a friend. */
export function Home({
  voice,
  onSignOut,
}: {
  voice: SteamVoice;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState(voice.me);
  const [friends, setFriends] = useState(voice.connection.friends);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joining, setJoining] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { session, incomingCalls, speaker, setSpeaker } = useVoice(voice);
  const showError = (err: Error) => setError(err.message);
  const dismissError = useCallback(() => setError(null), []);

  const refreshGroups = useCallback(
    () =>
      voice.connection
        .getGroups()
        .then(setGroups, (err: Error) =>
          setError(`Could not load groups: ${err.message}`),
        ),
    [voice],
  );

  useEffect(() => {
    const { connection } = voice;
    void refreshGroups();
    const offGroups = connection.on('groupsChanged', refreshGroups);
    // voice membership changes don't come as group changes
    const offJoined = connection.on(
      'VoiceChatClient.NotifyUserJoinedVoiceChat#1',
      refreshGroups,
    );
    const offLeft = connection.on(
      'VoiceChatClient.NotifyUserLeftVoiceChat#1',
      refreshGroups,
    );
    const offFriends = connection.on('friendsChanged', (list) => {
      setFriends(list);
      setMe(voice.me);
    });
    return () => {
      offGroups();
      offJoined();
      offLeft();
      offFriends();
    };
  }, [voice, refreshGroups]);

  const target = session?.target;
  const roomRows: Row[] = groups.flatMap((group) =>
    group.rooms
      .filter(
        (room) => room.voiceAllowed && matches(query, group.name, room.name),
      )
      .map((room) => ({
        kind: 'room' as const,
        key: `${group.groupId}:${room.chatId}`,
        group,
        room,
      })),
  );
  const shown = friends.filter((f) => matches(query, f.name)).sort(byName);
  const friendRow = (friend: Friend): Row => ({
    kind: 'friend',
    key: friend.steamid,
    friend,
  });
  const online = shown.filter((f) => f.online).map(friendRow);
  const offline = shown.filter((f) => !f.online).map(friendRow);
  // searching shows matching offline friends without having to expand them
  const offlineOpen = showOffline || query.trim() !== '';
  const sections: Section[] = [
    { key: 'rooms', title: 'VOICE ROOMS', data: roomRows },
    { key: 'online', title: 'ONLINE', count: online.length, data: online },
    {
      key: 'offline',
      title: 'OFFLINE',
      count: offline.length,
      data: offlineOpen ? offline : [],
    },
  ];

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need your password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Avatar
          url={me.avatarUrl}
          name={me.name}
          size={44}
          frame={colors.online}
        />
        <View style={styles.grow}>
          <Text style={styles.myName} numberOfLines={1}>
            {me.name}
          </Text>
          <Text style={styles.myStatus}>Online</Text>
        </View>
        <Pressable
          onPress={confirmSignOut}
          accessibilityLabel="Sign out"
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <SectionList<Row, Section>
        sections={sections}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingBottom: session ? 16 : insets.bottom + 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            onRefresh={() => {
              setRefreshing(true);
              void refreshGroups().finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.search}>
              <Field
                icon="search"
                value={query}
                onChangeText={setQuery}
                placeholder="Search friends and rooms"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
            </View>
            {joining && (
              <JoinGroup
                voice={voice}
                onJoined={() => {
                  setJoining(false);
                  void refreshGroups();
                }}
                onError={showError}
              />
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            title={section.title}
            count={section.count}
            action={
              section.key === 'rooms' ? (
                <Pressable
                  onPress={() => setJoining(!joining)}
                  hitSlop={10}
                  accessibilityLabel="Join a group chat"
                  style={styles.sectionAction}
                >
                  <Ionicons
                    name={joining ? 'close' : 'add'}
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={styles.sectionActionText}>
                    {joining ? 'Cancel' : 'Join group'}
                  </Text>
                </Pressable>
              ) : section.key === 'offline' && query.trim() === '' ? (
                <Pressable
                  onPress={() => setShowOffline(!showOffline)}
                  hitSlop={10}
                  style={styles.sectionAction}
                >
                  <Text style={styles.sectionActionText}>
                    {showOffline ? 'Hide' : 'Show'}
                  </Text>
                  <Ionicons
                    name={showOffline ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.accent}
                  />
                </Pressable>
              ) : undefined
            }
          />
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 && section.key !== 'offline' ? (
            <Text style={styles.empty}>
              {query.trim() !== ''
                ? 'No matches'
                : section.key === 'rooms'
                  ? 'No voice rooms yet. Join a group chat with its invite link.'
                  : 'None of your friends are online right now.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'room' ? (
            <RoomRow
              group={item.group}
              room={item.room}
              inVoice={item.room.membersInVoice.map((id) =>
                voice.connection.user(id),
              )}
              connected={
                target?.kind === 'group' &&
                target.groupId === item.group.groupId &&
                target.chatId === item.room.chatId
              }
              onJoin={() =>
                startVoice((mic) =>
                  voice.joinGroupVoice(
                    item.group.groupId,
                    item.room.chatId,
                    mic,
                  ),
                ).catch(showError)
              }
            />
          ) : (
            <FriendRow
              friend={item.friend}
              inCall={
                target?.kind === 'friend' &&
                target.steamid === item.friend.steamid
              }
              onCall={() =>
                startVoice((mic) =>
                  voice.callFriend(item.friend.steamid, mic),
                ).catch(showError)
              }
            />
          )
        }
      />
      {session && (
        <CallDock
          voice={voice}
          session={session}
          title={sessionTitle(voice, session, groups)}
          speaker={speaker}
          setSpeaker={setSpeaker}
        />
      )}
      <IncomingCall voice={voice} calls={incomingCalls} onError={showError} />
      <Toast message={error} onDismiss={dismissError} />
    </View>
  );
}

const styles = StyleSheet.create({
  // solid, the sticky section headers would show seams over a gradient
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#171a21',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  grow: { flex: 1 },
  myName: { color: colors.bright, fontSize: 18, fontWeight: '700' },
  myStatus: { color: colors.online, fontSize: 13, marginTop: 1 },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  search: { paddingHorizontal: 12, paddingTop: 12 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionActionText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  empty: {
    color: colors.muted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
