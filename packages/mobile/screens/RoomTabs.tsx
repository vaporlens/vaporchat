import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChatGroup, ChatTarget } from 'vaporchat/protocol';
import { chatKey } from 'vaporchat/steam/messages';
import { colors } from '../theme';

/** A group's rooms over its chat, switching between their text chats. Left out with one room. */
export function RoomTabs({
  group,
  chatId,
  unreadRooms,
  onOpen,
}: {
  group: ChatGroup;
  /** the room open */
  chatId: string;
  /** `chatKey`s */
  unreadRooms: ReadonlySet<string>;
  onOpen: (chat: ChatTarget) => void;
}) {
  if (group.rooms.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // a room switches with the keyboard up, not only closes it
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.bar}
    >
      {group.rooms.map((room) => {
        const chat = {
          kind: 'room',
          groupId: group.groupId,
          chatId: room.chatId,
        } as const;
        const selected = room.chatId === chatId;
        const color = selected ? colors.accent : colors.muted;
        return (
          <Pressable
            key={room.chatId}
            onPress={() => onOpen(chat)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={[
              room.name,
              room.voiceAllowed && 'voice',
              !selected && unreadRooms.has(chatKey(chat)) && 'unread',
            ]
              .filter(Boolean)
              .join(', ')}
            style={({ pressed }) => [
              styles.pill,
              selected && styles.selected,
              pressed && styles.pressed,
            ]}
          >
            {room.voiceAllowed && (
              <Ionicons name="volume-medium" size={14} color={color} />
            )}
            <Text style={[styles.title, { color }]}>{room.name}</Text>
            {!selected && unreadRooms.has(chatKey(chat)) && (
              <View style={styles.unreadDot} />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // never squeezed by a long chat below
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  bar: { gap: 8, padding: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.accentBackground },
  pressed: { opacity: 0.7 },
  title: { fontSize: 13, fontWeight: '700' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
