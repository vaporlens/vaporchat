import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceTarget } from 'vaporchat/client/voiceSession';
import type { ChatGroup } from 'vaporchat/protocol';
import { colors } from '../theme';
import { startVoice } from '../voice';
import { InVoice, VoicePill } from './Rows';

/** A group's voice channels on top of its chat: who is in each, and joining one. */
export function VoiceChannels({
  voice,
  group,
  target,
  onError,
}: {
  voice: SteamVoice;
  group: ChatGroup;
  /** the voice chat you are in, if any */
  target: VoiceTarget | undefined;
  onError: (err: Error) => void;
}) {
  const rooms = group.rooms.filter((room) => room.voiceAllowed);
  if (rooms.length === 0) return null;
  return (
    // a few rows tall at most, the chat below stays usable in groups with many channels
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      {rooms.map((room) => {
        const connected =
          target?.kind === 'group' &&
          target.groupId === group.groupId &&
          target.chatId === room.chatId;
        return (
          <View
            key={room.chatId}
            style={[styles.channel, connected && styles.channelConnected]}
          >
            <Ionicons name="volume-medium" size={18} color={colors.text} />
            <View style={styles.grow}>
              <Text style={styles.name} numberOfLines={1}>
                {room.name}
              </Text>
              <InVoice
                people={room.membersInVoice.map((id) =>
                  voice.connection.user(id),
                )}
                size={18}
              />
            </View>
            <VoicePill
              connected={connected}
              accessibilityLabel={`Join voice in ${room.name}`}
              onJoin={() =>
                startVoice((mic) =>
                  voice.joinGroupVoice(group.groupId, room.chatId, mic),
                ).catch(onError)
              }
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
    maxHeight: 190,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  content: { padding: 8, gap: 6 },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelConnected: { borderColor: colors.speaking },
  grow: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
