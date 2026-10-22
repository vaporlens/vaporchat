import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceTarget } from 'vaporchat/client/voiceSession';
import type { ChatGroup } from 'vaporchat/protocol';
import { colors } from '../theme';
import { startVoice } from '../voice';
import { InVoice, VoicePill } from './Rows';

// in larger text than this, two side by side leave their names no room
const WIDE_FONT_SCALE = 1.3;

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
  const wide = useWindowDimensions().fontScale > WIDE_FONT_SCALE;
  const rooms = group.rooms.filter((room) => room.voiceAllowed);
  if (rooms.length === 0) return null;
  return (
    // two rows of two at most, the chat below stays usable in groups with many channels
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      {rooms.map((room) => {
        const connected =
          target?.kind === 'group' &&
          target.groupId === group.groupId &&
          target.chatId === room.chatId;
        return (
          <View
            key={room.chatId}
            style={[
              styles.channel,
              wide && styles.channelWide,
              connected && styles.channelConnected,
            ]}
          >
            <View style={styles.grow}>
              <View style={styles.title}>
                <Ionicons name="volume-medium" size={18} color={colors.text} />
                <Text style={styles.name} numberOfLines={1}>
                  {room.name}
                </Text>
              </View>
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
  // never squeezed by a long chat below, a third row peeks out to show it scrolls
  list: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 160,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  // two per row
  content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 6,
    padding: 8,
  },
  channel: {
    width: '49%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelWide: { width: '100%' },
  channelConnected: { borderColor: colors.speaking },
  grow: { flex: 1, gap: 4 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
});
