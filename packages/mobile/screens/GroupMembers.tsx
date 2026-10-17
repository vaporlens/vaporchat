import { StyleSheet, Text, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { ChatGroup, Friend } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { InfoSheet } from '../components/InfoSheet';
import { friendStatus } from '../format';
import { colors } from '../theme';
import { STATUSES } from './SettingsScreen';

function statusColor({ online, game, away }: Friend) {
  if (!online) return colors.offline;
  if (game) return colors.inGame;
  return away ? colors.away : colors.online;
}

// playing, then online, then the rest, each by name
function rank({ online, game }: Friend, known: boolean) {
  if (!known) return 3;
  return game ? 0 : online ? 1 : 2;
}

/**
 * A group's members in a sheet while `open`, friends online first. Others have no status:
 * asking Steam for it signs the official clients out (see `FriendsList`).
 */
export function GroupMembers({
  voice,
  group,
  open,
  onClose,
}: {
  voice: SteamVoice;
  group: ChatGroup;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <InfoSheet
      info={open ? membersInfo(voice, group) : null}
      onClose={onClose}
    />
  );
}

function membersInfo(voice: SteamVoice, group: ChatGroup) {
  const known = new Set(voice.connection.friends.map((f) => f.steamid));
  known.add(voice.me.steamid);
  // ours as picked, steam's persona state has no invisible
  const mine = STATUSES[voice.connection.status];
  // looks up the ones not seen yet, their names come as the sheet shows
  const members = group.memberIds
    .map((id) => voice.connection.user(id))
    .sort(
      (a, b) =>
        rank(a, known.has(a.steamid)) - rank(b, known.has(b.steamid)) ||
        a.name.localeCompare(b.name),
    );
  return {
    title: 'Members',
    subtitle: `${members.length} in ${group.name}`,
    body: (
      <View style={styles.list}>
        {members.map((member) => {
          const status =
            member.steamid === voice.me.steamid
              ? mine
              : known.has(member.steamid)
                ? { label: friendStatus(member), color: statusColor(member) }
                : undefined;
          return (
            <View key={member.steamid} style={styles.row}>
              <Avatar
                url={member.avatarUrl}
                name={member.name}
                size={36}
                frame={status?.color}
              />
              <View style={styles.grow}>
                <Text style={styles.name} numberOfLines={1}>
                  {member.name}
                </Text>
                {status && (
                  <Text
                    style={[styles.status, { color: status.color }]}
                    numberOfLines={1}
                  >
                    {status.label}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    ),
  };
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  name: { color: colors.bright, fontSize: 15, fontWeight: '600' },
  status: { fontSize: 13, marginTop: 1 },
});
