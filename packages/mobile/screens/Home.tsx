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
import type {
  ChatGroup,
  ChatTarget,
  Friend,
  StoreItem,
} from 'vaporchat/protocol';
import { groupTitle } from 'vaporchat/steam/groups';
import { chatKey } from 'vaporchat/steam/messages';
import { useCached } from '../cache';
import { useUnread } from '../chats';
import { Appear } from '../components/Appear';
import { Avatar } from '../components/Avatar';
import { Field } from '../components/Field';
import { type Tab, TabBar } from '../components/TabBar';
import { Toast } from '../components/Toast';
import { colors } from '../theme';
import { startVoice, useVoice } from '../voice';
import { CallDock } from './CallDock';
import { Chat } from './Chat';
import { FeedTabs } from './FeedTabs';
import { IncomingCall } from './IncomingCall';
import { JoinGroup } from './JoinGroup';
import { type Page, PageStack } from './PageStack';
import { FriendRow, GroupRow, SectionHeader } from './Rows';
import { VoiceChannels } from './VoiceChannels';

/** How the app is connected to Steam, Home shows what was cached until it is online. */
export type Link =
  | { kind: 'connecting' }
  | { kind: 'online' }
  /** retried on its own, with backoff after `failures` failed attempts */
  | { kind: 'lost'; reason: string; failures: number };

const LINK_STATUS: Record<Link['kind'], { text: string; color: string }> = {
  connecting: { text: 'Connecting…', color: colors.muted },
  online: { text: 'Online', color: colors.online },
  lost: { text: 'Offline', color: colors.offline },
};

type Row = { key: string; chat: ChatTarget } & (
  | { kind: 'group'; group: ChatGroup }
  | { kind: 'friend'; friend: Friend }
);

interface Section {
  key: 'groups' | 'online' | 'offline';
  title: string;
  count?: number;
  data: Row[];
}

function findRoom(groups: ChatGroup[], groupId: string, chatId: string) {
  const group = groups.find((g) => g.groupId === groupId);
  return { group, room: group?.rooms.find((r) => r.chatId === chatId) };
}

function sessionTitle(
  voice: SteamVoice,
  session: VoiceSession,
  groups: ChatGroup[],
) {
  const { target } = session;
  if (target.kind === 'friend')
    return voice.connection.user(target.steamid).name;
  const { group, room } = findRoom(groups, target.groupId, target.chatId);
  return `${group?.name ?? 'Group'} › ${room?.name ?? 'voice'}`;
}

function chatHeader(
  voice: SteamVoice,
  chat: ChatTarget,
  groups: ChatGroup[],
  live: boolean,
) {
  if (chat.kind === 'friend') {
    const friend = voice.connection.user(chat.steamid);
    return {
      title: friend.name,
      subtitle: live && friend.online ? 'Online' : 'Offline',
      avatarUrl: friend.avatarUrl,
    };
  }
  const { group, room } = findRoom(groups, chat.groupId, chat.chatId);
  return {
    title: group?.name ?? 'Group',
    subtitle: room?.name ?? '',
    avatarUrl: group?.avatarUrl ?? null,
  };
}

function matches(query: string, ...names: string[]) {
  const q = query.trim().toLowerCase();
  return q === '' || names.some((name) => name.toLowerCase().includes(q));
}

const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name);

/**
 * Who you are and the tabs: Steam's deals, new releases, news and friends' activity, and chat
 * with your group chats and friends. Tap one to chat, join a room's voice, call a friend.
 */
export function Home({
  voice,
  link,
  onReconnect,
  onSignOut,
}: {
  voice: SteamVoice;
  link: Link;
  onReconnect: () => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState(voice.me);
  const [friends, setFriends] = useState(voice.connection.friends);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joining, setJoining] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chat, setChat] = useState<ChatTarget | null>(null);
  const [tab, setTab] = useState<Tab>('store');
  const [pages, setPages] = useState<Page[]>([]);
  const { session, incomingCalls, speaker, setSpeaker } = useVoice(voice);
  const unread = useUnread(voice, chat);
  // stable, the open chat reloads when it changes
  const showError = useCallback((err: Error) => setError(err.message), []);
  const dismissError = useCallback(() => setError(null), []);

  const loadGroups = useCallback(() => voice.connection.getGroups(), [voice]);
  const {
    data: cachedGroups,
    error: groupsError,
    reload: reloadGroups,
  } = useCached('groups', loadGroups);
  const refreshGroups = useCallback(
    () =>
      reloadGroups().catch((err: Error) =>
        setError(`Could not load groups: ${err.message}`),
      ),
    [reloadGroups],
  );
  const fetchedGroups = cachedGroups ?? [];

  useEffect(() => {
    const { connection } = voice;
    // a reconnect is a new connection
    setFriends(connection.friends);
    setMe(voice.me);
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

  // who is online or in voice is only known while connected
  const live = link.kind === 'online';
  // unnamed groups go by their members' names, which come in as `friendsChanged`
  const groups = fetchedGroups.map((group) => ({
    ...group,
    name: groupTitle(group, me.steamid, (id) => voice.connection.user(id).name),
    rooms: live
      ? group.rooms
      : group.rooms.map((room) => ({ ...room, membersInVoice: [] })),
  }));
  const target = session?.target;
  const groupRows: Row[] = groups.flatMap((group): Row[] => {
    // a group opens its first text room, its voice channels are on top of that chat
    const room = group.rooms.find((r) => !r.voiceAllowed) ?? group.rooms[0];
    if (!room || !matches(query, group.name, ...group.rooms.map((r) => r.name)))
      return [];
    const chat = {
      kind: 'room',
      groupId: group.groupId,
      chatId: room.chatId,
    } as const;
    return [{ kind: 'group', key: chatKey(chat), chat, group }];
  });
  const shown = friends
    .filter((f) => matches(query, f.name))
    .map((f) => (live ? f : { ...f, online: false }))
    .sort(byName);
  const friendRow = (friend: Friend): Row => {
    const chat = { kind: 'friend', steamid: friend.steamid } as const;
    return { kind: 'friend', key: chatKey(chat), chat, friend };
  };
  const online = shown.filter((f) => f.online).map(friendRow);
  const offline = shown.filter((f) => !f.online).map(friendRow);
  // searching shows matching offline friends without having to expand them, and so does
  // not knowing who is online
  const offlineOpen = showOffline || query.trim() !== '' || !live;
  const sections: Section[] = [
    { key: 'groups', title: 'GROUP CHATS', data: groupRows },
    {
      key: 'online',
      title: 'ONLINE',
      count: live ? online.length : undefined,
      data: online,
    },
    {
      key: 'offline',
      title: 'OFFLINE',
      count: offline.length,
      data: offlineOpen ? offline : [],
    },
  ];

  const push = useCallback(
    (page: Page) => setPages((stack) => [...stack, page]),
    [],
  );
  const openGame = useCallback(
    (item: StoreItem) =>
      push(
        item.appid === null
          ? { kind: 'bundle', item }
          : { kind: 'game', item: { ...item, appid: item.appid } },
      ),
    [push],
  );
  const back = useCallback(() => setPages((stack) => stack.slice(0, -1)), []);

  const chatGroup =
    chat?.kind === 'room'
      ? groups.find((group) => group.groupId === chat.groupId)
      : undefined;

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need your password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  return (
    <View style={styles.screen}>
      {chat && (
        <Appear from="right" style={styles.grow}>
          <Chat
            voice={voice}
            chat={chat}
            {...chatHeader(voice, chat, groups, live)}
            top={
              chatGroup && (
                <VoiceChannels
                  voice={voice}
                  group={chatGroup}
                  target={target}
                  onError={showError}
                />
              )
            }
            bottomInset={session ? 0 : insets.bottom}
            onBack={() => setChat(null)}
            onError={showError}
          />
        </Appear>
      )}
      <PageStack
        voice={voice}
        pages={pages}
        onBack={back}
        onOpenGame={openGame}
      />
      {/* hidden rather than unmounted, coming back keeps the scroll position and search */}
      <View style={[styles.grow, (chat || pages.length > 0) && styles.hidden]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Avatar
            url={me.avatarUrl}
            name={me.name}
            size={44}
            frame={LINK_STATUS[link.kind].color}
          />
          <View style={styles.grow}>
            <Text style={styles.myName} numberOfLines={1}>
              {me.name}
            </Text>
            <Text
              style={[styles.myStatus, { color: LINK_STATUS[link.kind].color }]}
              numberOfLines={1}
            >
              {link.kind === 'lost'
                ? `${LINK_STATUS.lost.text}: ${link.reason}`
                : LINK_STATUS[link.kind].text}
            </Text>
          </View>
          {link.kind === 'lost' && (
            <Pressable
              onPress={onReconnect}
              accessibilityLabel="Reconnect now"
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="refresh" size={22} color={colors.muted} />
            </Pressable>
          )}
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
        <FeedTabs
          voice={voice}
          tab={tab}
          onOpenGame={openGame}
          onOpenPage={push}
          onError={showError}
        />
        <SectionList<Row, Section>
          style={tab !== 'chat' && styles.hidden}
          sections={sections}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listEnd}
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
                  placeholder="Search friends and groups"
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  returnKeyType="search"
                />
              </View>
              {joining && (
                <Appear>
                  <JoinGroup
                    voice={voice}
                    onJoined={() => {
                      setJoining(false);
                      void refreshGroups();
                    }}
                    onError={showError}
                  />
                </Appear>
              )}
            </>
          }
          renderSectionHeader={({ section }) => (
            <SectionHeader
              title={section.title}
              count={section.count}
              action={
                section.key === 'groups' ? (
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
                ) : section.key === 'offline' && query.trim() === '' && live ? (
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
                  : section.key !== 'groups'
                    ? live
                      ? 'None of your friends are online right now.'
                      : 'Who is online shows once connected.'
                    : // with cached groups shown, the header tells about the connection
                      cachedGroups === null && groupsError
                      ? `Could not load groups: ${groupsError}`
                      : 'No group chats yet. Join one with its invite link.'}
              </Text>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'group' ? (
              <GroupRow
                group={item.group}
                inVoice={item.group.rooms.flatMap((room) =>
                  room.membersInVoice.map((id) => voice.connection.user(id)),
                )}
                connected={
                  target?.kind === 'group' &&
                  target.groupId === item.group.groupId
                }
                unread={unread[item.key] ?? 0}
                onOpen={() => setChat(item.chat)}
              />
            ) : (
              <FriendRow
                friend={item.friend}
                inCall={
                  target?.kind === 'friend' &&
                  target.steamid === item.friend.steamid
                }
                unread={unread[item.key] ?? 0}
                onOpen={() => setChat(item.chat)}
                onCall={() =>
                  startVoice((mic) =>
                    voice.callFriend(item.friend.steamid, mic),
                  ).catch(showError)
                }
              />
            )
          }
        />
        <TabBar
          tab={tab}
          onChange={setTab}
          bottomInset={session ? 0 : insets.bottom}
        />
      </View>
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
    backgroundColor: colors.bar,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  grow: { flex: 1 },
  hidden: { display: 'none' },
  listEnd: { paddingBottom: 16 },
  myName: { color: colors.bright, fontSize: 18, fontWeight: '700' },
  myStatus: { fontSize: 13, marginTop: 1 },
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
