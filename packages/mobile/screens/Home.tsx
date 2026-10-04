import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import type { ChatGroup, Friend } from 'vaporchat/protocol';
import { useColors } from '../colors';
import { startVoice, useVoice } from '../voice';
import { CallBar } from './CallBar';
import { JoinGroup } from './JoinGroup';

type Row =
  | {
      kind: 'room';
      key: string;
      groupId: string;
      group: string;
      room: ChatGroup['rooms'][number];
    }
  | { kind: 'friend'; key: string; friend: Friend };

function Avatar({ url }: { url: string | null }) {
  const colors = useColors();
  return url ? (
    <Image source={{ uri: url }} style={styles.avatar} />
  ) : (
    <View style={[styles.avatar, { backgroundColor: colors.border }]} />
  );
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

/** Who you are, your group voice rooms and your friends. Tap a room to join, a friend to call. */
export function Home({
  voice,
  onSignOut,
}: {
  voice: SteamVoice;
  onSignOut: () => void;
}) {
  const colors = useColors();
  const [me, setMe] = useState(voice.me);
  const [friends, setFriends] = useState(voice.connection.friends);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { session, incomingCalls, speaker, setSpeaker } = useVoice(voice);
  const showError = (err: Error) => setError(err.message);

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

  const voiceRooms: Row[] = groups.flatMap((group) =>
    group.rooms
      .filter((room) => room.voiceAllowed)
      .map((room) => ({
        kind: 'room' as const,
        key: `${group.groupId}:${room.chatId}`,
        groupId: group.groupId,
        group: group.name,
        room,
      })),
  );
  const friendRows: Row[] = friends.map((friend) => ({
    kind: 'friend',
    key: friend.steamid,
    friend,
  }));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Avatar url={me.avatarUrl} />
        <Text style={[styles.name, { color: colors.text }]}>{me.name}</Text>
        <Button title="Sign out" onPress={onSignOut} />
      </View>
      <CallBar
        voice={voice}
        session={session}
        incomingCalls={incomingCalls}
        title={session ? sessionTitle(voice, session, groups) : ''}
        onError={showError}
        speaker={speaker}
        setSpeaker={setSpeaker}
      />
      {error && (
        <Text
          style={[styles.error, { color: colors.error }]}
          onPress={() => setError(null)}
        >
          {error}
        </Text>
      )}
      <SectionList<Row>
        sections={[
          { title: 'Voice rooms', data: voiceRooms },
          {
            title: `Friends (${friends.filter((f) => f.online).length} online)`,
            data: friendRows,
          },
        ]}
        ListHeaderComponent={
          <JoinGroup
            voice={voice}
            onJoined={() => void refreshGroups()}
            onError={showError}
          />
        }
        keyExtractor={(row) => row.key}
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.section,
              { color: colors.muted, backgroundColor: colors.background },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) =>
          item.kind === 'room' ? (
            <Pressable
              style={styles.row}
              onPress={() =>
                startVoice((mic) =>
                  voice.joinGroupVoice(item.groupId, item.room.chatId, mic),
                ).catch(showError)
              }
            >
              <Text style={{ color: colors.text, flex: 1 }}>
                {item.group} › {item.room.name}
              </Text>
              <Text style={{ color: colors.muted }}>
                {item.room.membersInVoice.length} in voice
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.row}
              disabled={!item.friend.online}
              onPress={() =>
                startVoice((mic) =>
                  voice.callFriend(item.friend.steamid, mic),
                ).catch(showError)
              }
            >
              <Avatar url={item.friend.avatarUrl} />
              <Text
                style={{
                  color: item.friend.online ? colors.text : colors.muted,
                  flex: 1,
                }}
              >
                {item.friend.name}
              </Text>
              {item.friend.online && (
                <View
                  style={[styles.dot, { backgroundColor: colors.online }]}
                />
              )}
            </Pressable>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, fontSize: 18, fontWeight: '600' },
  error: { padding: 16 },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
