import type {
  ChatMessage,
  ChatTarget,
  IncomingChatMessage,
  StickerPart,
} from '../protocol.ts';
import { parseBBCode } from './bbcode.ts';
import type { SteamCM } from './cm.ts';
import { steamIdFromAccountId } from './friends.ts';
import { decodeProto } from './protos.ts';

// EChatEntryType.ChatMsg, the others are typing notices, invites and the like
const CHAT_MESSAGE = 1;
const HISTORY_COUNT = 50;
// the newest message there can be, steam's history starts from it
const LATEST = 2 ** 31 - 1;

interface FriendMessageNotification {
  steamid_friend: string;
  chat_entry_type?: number;
  message?: string;
  rtime32_server_timestamp?: number;
  ordinal?: number;
  /** we wrote it, from another session */
  local_echo?: boolean;
}

interface RoomMessageNotification {
  chat_group_id: string;
  chat_id: string;
  steamid_sender: string;
  message?: string;
  timestamp?: number;
  ordinal?: number;
  /** joins, kicks and the like, Steam's clients render those themselves */
  server_message?: object;
}

/** History entries of either kind of chat, by account id. */
interface HistoryEntry {
  accountId: number;
  message?: string;
  timestamp?: number;
  ordinal?: number;
}

interface SentMessage {
  modified_message?: string;
  server_timestamp?: number;
  ordinal?: number;
}

// a message is identified by its server timestamp, and its ordinal among those of the same second
function chatMessage(
  sender: string,
  bbcode: string,
  timestamp = 0,
  ordinal = 0,
): ChatMessage {
  return {
    id: `${timestamp}:${ordinal}`,
    sender,
    parts: parseBBCode(bbcode),
    // steam's times are whole seconds, the ordinal as milliseconds keeps their order
    time: timestamp * 1000 + ordinal,
  };
}

/** One key per chat, to tell chats apart in maps and events. */
export function chatKey(chat: ChatTarget) {
  return chat.kind === 'friend'
    ? chat.steamid
    : `${chat.groupId}:${chat.chatId}`;
}

/** Adds messages to a chat's list, oldest first. Our sent messages and their echoes are one. */
export function mergeMessages(list: ChatMessage[], added: ChatMessage[]) {
  const byId = new Map(list.map((message) => [message.id, message]));
  for (const message of added) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.time - b.time);
}

/** Calls `handler` for every text message in any chat, ours from other sessions included. */
export function onChatMessages(
  cm: SteamCM,
  handler: (incoming: IncomingChatMessage) => void,
) {
  cm.onMessage('FriendMessagesClient.IncomingMessage#1', (_header, body) => {
    const n = decodeProto<FriendMessageNotification>(
      'CFriendMessages_IncomingMessage_Notification',
      body,
    );
    if (n.chat_entry_type !== CHAT_MESSAGE) return;
    handler({
      chat: { kind: 'friend', steamid: n.steamid_friend },
      message: chatMessage(
        n.local_echo ? cm.steamid : n.steamid_friend,
        n.message ?? '',
        n.rtime32_server_timestamp,
        n.ordinal,
      ),
    });
  });
  cm.onMessage(
    'ChatRoomClient.NotifyIncomingChatMessage#1',
    (_header, body) => {
      const n = decodeProto<RoomMessageNotification>(
        'CChatRoom_IncomingChatMessage_Notification',
        body,
      );
      if (n.server_message) return;
      handler({
        chat: { kind: 'room', groupId: n.chat_group_id, chatId: n.chat_id },
        message: chatMessage(
          n.steamid_sender,
          n.message ?? '',
          n.timestamp,
          n.ordinal,
        ),
      });
    },
  );
}

/**
 * Sends text or a sticker, returns the message as Steam stored it. Steam turns `:name:` of the
 * sender's emoticons into emoticons and `/sticker <name>` into the sticker, checking they own them.
 */
export async function sendMessage(
  cm: SteamCM,
  chat: ChatTarget,
  content: string | StickerPart,
): Promise<ChatMessage> {
  // steam escapes brackets that aren't BBCode as `\[`, tags we'd send would be dropped anyway
  const message =
    typeof content === 'string'
      ? content.replace(/\[/g, '\\[')
      : `/sticker ${content.name}`;
  // echoing shows the message on our other devices, like the official clients do
  const sent =
    chat.kind === 'friend'
      ? await cm.call<SentMessage>('FriendMessages.SendMessage#1', {
          steamid: chat.steamid,
          chat_entry_type: CHAT_MESSAGE,
          message,
          contains_bbcode: true,
          echo_to_sender: true,
        })
      : await cm.call<SentMessage>('ChatRoom.SendChatMessage#1', {
          chat_group_id: chat.groupId,
          chat_id: chat.chatId,
          message,
          echo_to_sender: true,
        });
  return chatMessage(
    cm.steamid,
    sent.modified_message || message,
    sent.server_timestamp,
    sent.ordinal,
  );
}

/** The latest messages of a chat, oldest first. */
export async function getRecentMessages(
  cm: SteamCM,
  chat: ChatTarget,
): Promise<ChatMessage[]> {
  const history = await getHistory(cm, chat);
  return mergeMessages(
    [],
    history.map((entry) =>
      chatMessage(
        steamIdFromAccountId(entry.accountId),
        entry.message ?? '',
        entry.timestamp,
        entry.ordinal,
      ),
    ),
  );
}

async function getHistory(
  cm: SteamCM,
  chat: ChatTarget,
): Promise<HistoryEntry[]> {
  if (chat.kind === 'friend') {
    const { messages = [] } = await cm.call<{
      messages?: (Omit<HistoryEntry, 'accountId'> & { accountid: number })[];
    }>('FriendMessages.GetRecentMessages#1', {
      steamid1: cm.steamid,
      steamid2: chat.steamid,
      count: HISTORY_COUNT,
      most_recent_conversation: false,
      bbcode_format: true,
      time_last: LATEST,
    });
    return messages.map((m) => ({ ...m, accountId: m.accountid }));
  }
  const { messages = [] } = await cm.call<{
    messages?: {
      sender: number;
      server_timestamp?: number;
      message?: string;
      ordinal?: number;
      server_message?: object;
      deleted?: boolean;
    }[];
  }>('ChatRoom.GetMessageHistory#1', {
    chat_group_id: chat.groupId,
    chat_id: chat.chatId,
    max_count: HISTORY_COUNT,
  });
  return messages
    .filter((m) => !m.server_message && !m.deleted)
    .map((m) => ({
      accountId: m.sender,
      message: m.message,
      timestamp: m.server_timestamp,
      ordinal: m.ordinal,
    }));
}
