import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceTarget } from 'vaporchat/client/voiceSession';
import type { ChatGroup, ChatTarget } from 'vaporchat/protocol';
import { chatKey } from 'vaporchat/steam/messages';
import { friendStatus } from '../format';
import { colors } from '../theme';
import { Chat } from './Chat';
import { GroupMembers } from './GroupMembers';
import { RoomTabs } from './RoomTabs';
import { VoiceChannels } from './VoiceChannels';

/** A group chat's group and room, either missing once gone. */
export function findRoom(groups: ChatGroup[], groupId: string, chatId: string) {
  const group = groups.find((g) => g.groupId === groupId);
  return { group, room: group?.rooms.find((r) => r.chatId === chatId) };
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
      subtitle: live ? friendStatus(friend) : 'Offline',
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

/**
 * A group chat or a friend's on the stack. A group's has its rooms on top, then its voice
 * channels.
 */
export const ChatRoute = memo(function ChatRoute({
  voice,
  chat,
  groups,
  live,
  target,
  unreadRooms,
  bottomInset,
  onOpenChat,
  onBack,
  onError,
}: {
  voice: SteamVoice;
  chat: ChatTarget;
  groups: ChatGroup[];
  live: boolean;
  target: VoiceTarget | undefined;
  /** `chatKey`s */
  unreadRooms: ReadonlySet<string>;
  bottomInset: number;
  /** in place of this one */
  onOpenChat: (chat: ChatTarget) => void;
  onBack: () => void;
  onError: (err: Error) => void;
}) {
  const [membersOpen, setMembersOpen] = useState(false);
  const group =
    chat.kind === 'room'
      ? findRoom(groups, chat.groupId, chat.chatId).group
      : undefined;
  return (
    <>
      <Chat
        // another room is another chat, none of this one's messages and drafts
        key={chatKey(chat)}
        voice={voice}
        chat={chat}
        {...chatHeader(voice, chat, groups, live)}
        headerAction={
          group && (
            <Pressable
              onPress={() => setMembersOpen(true)}
              accessibilityLabel="Members"
              hitSlop={8}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="people-outline" size={22} color={colors.muted} />
            </Pressable>
          )
        }
        top={
          group &&
          chat.kind === 'room' && (
            <>
              <RoomTabs
                group={group}
                chatId={chat.chatId}
                unreadRooms={unreadRooms}
                onOpen={onOpenChat}
              />
              <VoiceChannels
                voice={voice}
                group={group}
                target={target}
                onError={onError}
              />
            </>
          )
        }
        bottomInset={bottomInset}
        onBack={onBack}
        onError={onError}
      />
      {group && (
        <GroupMembers
          voice={voice}
          group={group}
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  button: { padding: 4 },
  pressed: { opacity: 0.6 },
});
