import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CommonActions,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  MyStatus,
} from 'vaporchat/protocol';
import { groupTitle } from 'vaporchat/steam/groups';
import { chatKey } from 'vaporchat/steam/messages';
import { useMutedFriends, useStayConnected } from '../alertSettings';
import { useAlerts } from '../alerts';
import { useCached } from '../cache';
import { useUnread } from '../chats';
import { Appear } from '../components/Appear';
import { Avatar } from '../components/Avatar';
import { SearchField } from '../components/Field';
import { type Tab, TabBar } from '../components/TabBar';
import { Toast } from '../components/Toast';
import { matches } from '../search';
import { saveStatus } from '../statusStore';
import { colors } from '../theme';
import { startVoice, useVoice } from '../voice';
import { CallDock } from './CallDock';
import { ChatRoute, findRoom } from './ChatRoute';
import { FeedTabs } from './FeedTabs';
import { IncomingCall } from './IncomingCall';
import { JoinGroup } from './JoinGroup';
import { NoticesScreen, useSteamNotices } from './NoticesScreen';
import { PageScreen } from './PageScreen';
import { FriendRow, GroupRow, SectionHeader } from './Rows';
import { SettingsScreen, STATUSES } from './SettingsScreen';
import { navigationTheme, type Routes, Stack, usePages } from './stack';

/** How the app is connected to Steam, Home shows what was cached until it is online. */
export type Link =
  | { kind: 'connecting' }
  | { kind: 'online' }
  /** retried on its own, with backoff after `failures` failed attempts */
  | { kind: 'lost'; reason: string; failures: number };

const LINK_STATUS: Record<Link['kind'], { text: string; color: string }> = {
  connecting: { text: 'Connecting…', color: colors.muted },
  // shown as the status friends see once online
  online: { text: 'Online', color: colors.online },
  lost: { text: 'Offline', color: colors.offline },
};

// a friend's row keeps its props while the friend stays the same, it doesn't render again then
type Row = { key: string } & (
  | { kind: 'group'; chat: ChatTarget; group: ChatGroup; inVoice: Friend[] }
  | { kind: 'friend'; friend: Friend }
);

interface Section {
  key: 'groups' | 'online' | 'offline';
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
  const { group, room } = findRoom(groups, target.groupId, target.chatId);
  return `${group?.name ?? 'Group'} › ${room?.name ?? 'voice'}`;
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
  const navigation = useNavigationContainerRef<Routes>();
  const [me, setMe] = useState(voice.me);
  const [friends, setFriends] = useState(voice.connection.friends);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joining, setJoining] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('store');
  const [status, setStatus] = useState(voice.connection.status);
  const { session, incomingCalls, speaker, setSpeaker, headset } =
    useVoice(voice);
  const unread = useUnread(voice);
  const unreadNotices = useSteamNotices(voice).filter((n) => !n.read).length;
  // stable, the open chat reloads when it changes
  const showError = useCallback((err: Error) => setError(err.message), []);
  const { muted, toggle: toggleMute } = useMutedFriends(showError);
  const stayConnected = useStayConnected(showError);
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
  // `friends` changes as names do, a new `groups` also re-renders the open chat for its header
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  const groups = useMemo(
    () =>
      (cachedGroups ?? []).map((group) => ({
        ...group,
        name: groupTitle(
          group,
          me.steamid,
          (id) => voice.connection.user(id).name,
        ),
        rooms: live
          ? group.rooms
          : group.rooms.map((room) => ({ ...room, membersInVoice: [] })),
      })),
    [cachedGroups, friends, me.steamid, live, voice],
  );
  const target = session?.target;
  // searching shows matching offline friends without having to expand them, and so does
  // not knowing who is online
  const offlineOpen = showOffline || query.trim() !== '' || !live;
  // only when these change, Home also renders for unread messages and calls
  const sections = useMemo((): Section[] => {
    const groupRows = groups.flatMap((group): Row[] => {
      // a group opens its first text room, its rooms and voice channels are on top of that chat
      const room = group.rooms.find((r) => !r.voiceAllowed) ?? group.rooms[0];
      if (
        !room ||
        !matches(query, group.name, ...group.rooms.map((r) => r.name))
      )
        return [];
      const chat = {
        kind: 'room',
        groupId: group.groupId,
        chatId: room.chatId,
      } as const;
      const inVoice = group.rooms.flatMap((r) =>
        r.membersInVoice.map((id) => voice.connection.user(id)),
      );
      return [{ kind: 'group', key: chatKey(chat), chat, group, inVoice }];
    });
    const matching = friends.filter((f) => matches(query, f.name));
    // by name within online and offline already, not knowing who is online makes it one list
    const shown = live
      ? matching
      : matching.map((f) => ({ ...f, online: false })).sort(byName);
    const friendRow = (friend: Friend): Row => ({
      kind: 'friend',
      key: chatKey({ kind: 'friend', steamid: friend.steamid }),
      friend,
    });
    const online = shown.filter((f) => f.online).map(friendRow);
    const offline = shown.filter((f) => !f.online).map(friendRow);
    return [
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
  }, [groups, friends, query, live, offlineOpen, voice]);

  const { push, openGame, back } = usePages(navigation);

  const openChat = useCallback(
    (chat: ChatTarget) => navigation.navigate('chat', { chat }),
    [navigation],
  );
  // the open chat's route changes to the other room
  const switchChat = useCallback(
    (chat: ChatTarget) =>
      navigation.dispatch(CommonActions.setParams({ chat })),
    [navigation],
  );
  useAlerts(voice, groups, muted, openChat);
  const callFriend = useCallback(
    (friend: Friend) =>
      void startVoice((mic) => voice.callFriend(friend.steamid, mic)).catch(
        showError,
      ),
    [voice, showError],
  );

  function changeStatus(picked: MyStatus) {
    setStatus(picked);
    voice.connection.setStatus(picked);
    // the next launch and reconnects log on with it
    saveStatus(picked).catch(showError);
  }

  // online, the status friends see
  const shownStatus =
    link.kind === 'online'
      ? STATUSES[status]
      : {
          label:
            link.kind === 'lost'
              ? `${LINK_STATUS.lost.text}: ${link.reason}`
              : LINK_STATUS[link.kind].text,
          color: LINK_STATUS[link.kind].color,
        };

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need your password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  // the chat and pages are pushed over them
  const tabs = (
    <View style={styles.grow}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Avatar
          url={me.avatarUrl}
          name={me.name}
          size={44}
          frame={shownStatus.color}
        />
        <View style={styles.grow}>
          <Text style={styles.myName} numberOfLines={1}>
            {me.name}
          </Text>
          <Text
            style={[styles.myStatus, { color: shownStatus.color }]}
            numberOfLines={1}
          >
            {shownStatus.label}
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
          onPress={() => navigation.navigate('notifications')}
          accessibilityLabel={`Notifications, ${unreadNotices} unread`}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={colors.muted}
          />
          {unreadNotices > 0 && (
            <Text style={styles.badge}>
              {unreadNotices > 99 ? '99+' : unreadNotices}
            </Text>
          )}
        </Pressable>
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
      </View>
      <FeedTabs
        feeds={voice.connection.feeds}
        voice={voice}
        tab={tab}
        onOpenGame={openGame}
        onOpenPage={push}
        onError={showError}
      />
      {/* hidden by a View, Android wraps a list that can refresh in a view it doesn't hide */}
      <View style={[styles.grow, tab !== 'chat' && styles.hidden]}>
        <SectionList<Row, Section>
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
                <SearchField
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search friends and groups"
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
                chat={item.chat}
                inVoice={item.inVoice}
                connected={
                  target?.kind === 'group' &&
                  target.groupId === item.group.groupId
                }
                unread={item.group.rooms.some((room) =>
                  unread.rooms.has(
                    chatKey({
                      kind: 'room',
                      groupId: item.group.groupId,
                      chatId: room.chatId,
                    }),
                  ),
                )}
                onOpen={openChat}
              />
            ) : (
              <FriendRow
                friend={item.friend}
                inCall={
                  target?.kind === 'friend' &&
                  target.steamid === item.friend.steamid
                }
                unread={unread.friends.get(item.friend.steamid) ?? 0}
                onOpen={openChat}
                onCall={callFriend}
              />
            )
          }
        />
      </View>
      <TabBar
        tab={tab}
        onChange={setTab}
        bottomInset={session ? 0 : insets.bottom}
        chatUnread={unread.friends.size > 0 || unread.rooms.size > 0}
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
          {/* render callbacks, the screens show what Home has now */}
          <Stack.Screen name="tabs">{() => tabs}</Stack.Screen>
          <Stack.Screen name="chat">
            {({ route }) => (
              <ChatRoute
                voice={voice}
                // from the route, it still shows while it is swiped away
                chat={route.params.chat}
                groups={groups}
                live={live}
                target={target}
                unreadRooms={unread.rooms}
                mutedFriends={muted}
                bottomInset={session ? 0 : insets.bottom}
                onOpenChat={switchChat}
                onToggleMute={toggleMute}
                onBack={back}
                onError={showError}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="settings">
            {() => (
              <SettingsScreen
                status={status}
                onChangeStatus={changeStatus}
                stayConnected={
                  stayConnected.available ? stayConnected.on : null
                }
                onChangeStayConnected={stayConnected.change}
                onSignOut={confirmSignOut}
                onBack={back}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="notifications">
            {() => (
              <NoticesScreen
                voice={voice}
                onBack={back}
                onOpenGame={openGame}
                onError={showError}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="page">
            {({ route }) => (
              <PageScreen
                feeds={voice.connection.feeds}
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
      {session && (
        <CallDock
          voice={voice}
          session={session}
          title={sessionTitle(voice, session, groups)}
          speaker={speaker}
          setSpeaker={setSpeaker}
          headset={headset}
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
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    color: colors.bright,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
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
