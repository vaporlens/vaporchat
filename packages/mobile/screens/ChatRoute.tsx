import { memo } from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceTarget } from 'vaporchat/client/voiceSession';
import type { ChatGroup, ChatTarget } from 'vaporchat/protocol';
import { Chat } from './Chat';
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

/** A group chat or a friend's on the stack, its voice channels on top of a group's. */
export const ChatRoute = memo(function ChatRoute({
  voice,
  chat,
  groups,
  live,
  target,
  bottomInset,
  onBack,
  onError,
}: {
  voice: SteamVoice;
  chat: ChatTarget;
  groups: ChatGroup[];
  live: boolean;
  target: VoiceTarget | undefined;
  bottomInset: number;
  onBack: () => void;
  onError: (err: Error) => void;
}) {
  const group =
    chat.kind === 'room'
      ? findRoom(groups, chat.groupId, chat.chatId).group
      : undefined;
  return (
    <Chat
      voice={voice}
      chat={chat}
      {...chatHeader(voice, chat, groups, live)}
      top={
        group && (
          <VoiceChannels
            voice={voice}
            group={group}
            target={target}
            onError={onError}
          />
        )
      }
      bottomInset={bottomInset}
      onBack={onBack}
      onError={onError}
    />
  );
});
