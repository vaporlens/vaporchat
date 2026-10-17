import type {
  ChatMessage,
  ChatTarget,
  FeedPage,
  IncomingChatMessage,
  Reaction,
  ReactionChange,
  ReactionKey,
  StickerPart,
} from '../protocol.ts';
import { emoticonUrl, parseBBCode, stickerUrl } from './bbcode.ts';
import type { SteamCM } from './cm.ts';
import { steamIdFromAccountId } from './friends.ts';
import { decodeProto } from './protos.ts';

// EChatEntryType.ChatMsg, the others are typing notices, invites and the like
const CHAT_MESSAGE = 1;
// EChatEntryType.Typing
const TYPING = 2;
const HISTORY_COUNT = 50;
// EMessageReactionType, the same numbers in friend and room chats
const REACTION_TYPES = { emoticon: 1, sticker: 2 } as const;
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
  reactions: Reaction[];
}

interface ReactionNotification {
  server_timestamp?: number;
  ordinal?: number;
  reactor: string;
  reaction_type?: number;
  reaction?: string;
  is_add?: boolean;
}

/** A reaction as Steam sends it, null for kinds this doesn't know. */
function reactionKey(type = 0, name = ''): ReactionKey | null {
  // emoticons as typed, `:name:`
  if (type === REACTION_TYPES.emoticon)
    return { kind: 'emoticon', name: name.replace(/^:|:$/g, '') };
  if (type === REACTION_TYPES.sticker) return { kind: 'sticker', name };
  return null;
}

function reaction(key: ReactionKey, count: number, mine: boolean): Reaction {
  const url =
    key.kind === 'emoticon' ? emoticonUrl(key.name) : stickerUrl(key.name);
  return { ...key, url, count, mine };
}

function messageId(timestamp = 0, ordinal = 0) {
  return `${timestamp}:${ordinal}`;
}

interface SentMessage {
  modified_message?: string;
  server_timestamp?: number;
  ordinal?: number;
}

// steam's times are whole seconds, the ordinal as milliseconds keeps their order
function messageTime(timestamp = 0, ordinal = 0) {
  return timestamp * 1000 + ordinal;
}

export function fromMessageTime(time: number) {
  return { timestamp: Math.floor(time / 1000), ordinal: time % 1000 };
}

// a message is identified by its server timestamp, and its ordinal among those of the same second
function chatMessage(
  sender: string,
  bbcode: string,
  timestamp = 0,
  ordinal = 0,
  reactions: Reaction[] = [],
): ChatMessage {
  return {
    id: messageId(timestamp, ordinal),
    sender,
    parts: parseBBCode(bbcode),
    time: messageTime(timestamp, ordinal),
    reactions,
  };
}

/**
 * A message with a reaction change applied. Ours count once, so their echo after we reacted
 * changes nothing. Unchanged messages are returned as they were.
 */
export function applyReaction(
  message: ChatMessage,
  {
    reaction: key,
    reactor,
    added,
  }: Pick<ReactionChange, 'reaction' | 'reactor' | 'added'>,
  me: string,
): ChatMessage {
  const existing = message.reactions.find(
    (r) => r.kind === key.kind && r.name === key.name,
  );
  const mine = reactor === me;
  if (mine && (existing?.mine ?? false) === added) return message;
  if (!existing && !added) return message;
  const count = (existing?.count ?? 0) + (added ? 1 : -1);
  const changed = reaction(
    key,
    count,
    mine ? added : (existing?.mine ?? false),
  );
  const reactions = existing
    ? message.reactions.map((r) => (r === existing ? changed : r))
    : [...message.reactions, changed];
  return { ...message, reactions: reactions.filter((r) => r.count > 0) };
}

/** Calls `handler` for reactions put on or taken off messages in any chat, ours included. */
export function onReactions(
  cm: SteamCM,
  handler: (change: ReactionChange) => void,
) {
  const handle = (chat: ChatTarget, n: ReactionNotification) => {
    const key = reactionKey(n.reaction_type, n.reaction);
    if (!key) return;
    handler({
      chat,
      messageId: messageId(n.server_timestamp, n.ordinal),
      reaction: key,
      reactor: n.reactor,
      added: n.is_add ?? false,
    });
  };
  cm.onMessage('FriendMessagesClient.MessageReaction#1', (_header, body) => {
    const n = decodeProto<ReactionNotification & { steamid_friend: string }>(
      'CFriendMessages_MessageReaction_Notification',
      body,
    );
    handle({ kind: 'friend', steamid: n.steamid_friend }, n);
  });
  cm.onMessage('ChatRoomClient.NotifyMessageReaction#1', (_header, body) => {
    const n = decodeProto<
      ReactionNotification & { chat_group_id: string; chat_id: string }
    >('CChatRoom_MessageReaction_Notification', body);
    handle({ kind: 'room', groupId: n.chat_group_id, chatId: n.chat_id }, n);
  });
}

/** Puts a reaction on a message (`added`), or takes ours off. */
export async function react(
  cm: SteamCM,
  chat: ChatTarget,
  message: Pick<ChatMessage, 'time'>,
  { kind, name }: ReactionKey,
  added: boolean,
) {
  const { timestamp, ordinal } = fromMessageTime(message.time);
  const change = {
    server_timestamp: timestamp,
    ordinal,
    reaction_type: REACTION_TYPES[kind],
    // emoticons as typed, Steam denies them without the colons
    reaction: kind === 'emoticon' ? `:${name}:` : name,
    is_add: added,
  };
  if (chat.kind === 'friend')
    await cm.call('FriendMessages.UpdateMessageReaction#1', {
      steamid: chat.steamid,
      ...change,
    });
  else
    await cm.call('ChatRoom.UpdateMessageReaction#1', {
      chat_group_id: chat.groupId,
      chat_id: chat.chatId,
      ...change,
    });
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

/** Calls `handler` with the friend each time they type to us. Rooms have no typing notices. */
export function onTyping(cm: SteamCM, handler: (steamid: string) => void) {
  cm.onMessage('FriendMessagesClient.IncomingMessage#1', (_header, body) => {
    const n = decodeProto<FriendMessageNotification>(
      'CFriendMessages_IncomingMessage_Notification',
      body,
    );
    // local echoes are ours, from another device
    if (n.chat_entry_type === TYPING && !n.local_echo)
      handler(n.steamid_friend);
  });
}

/** Tells a friend we're typing to them, once every few seconds while we do. */
export async function sendTyping(cm: SteamCM, steamid: string) {
  await cm.call('FriendMessages.SendMessage#1', {
    steamid,
    chat_entry_type: TYPING,
  });
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

/**
 * The latest messages of a chat, oldest first. Older ones come with `before: next`, which is
 * null when there are none.
 */
export async function getRecentMessages(
  cm: SteamCM,
  chat: ChatTarget,
  before: number | null = null,
): Promise<FeedPage<ChatMessage>> {
  const { entries, next } = await getHistory(cm, chat, before);
  return {
    items: mergeMessages(
      [],
      entries.map((entry) =>
        chatMessage(
          steamIdFromAccountId(entry.accountId),
          entry.message ?? '',
          entry.timestamp,
          entry.ordinal,
          entry.reactions,
        ),
      ),
    ),
    next,
  };
}

/** Where history older than Steam's page of it starts, its last message is the oldest. */
function olderThan(
  more: boolean | undefined,
  oldest: { timestamp?: number; ordinal?: number } | undefined,
) {
  return more && oldest ? messageTime(oldest.timestamp, oldest.ordinal) : null;
}

/** A chat's history before `before`, a message's `time`. */
async function getHistory(
  cm: SteamCM,
  chat: ChatTarget,
  before: number | null,
): Promise<{ entries: HistoryEntry[]; next: number | null }> {
  const last = before === null ? null : fromMessageTime(before);
  if (chat.kind === 'friend') {
    const { messages = [], more_available } = await cm.call<{
      messages?: (Omit<HistoryEntry, 'accountId' | 'reactions'> & {
        accountid: number;
        reactions?: {
          reaction_type?: number;
          reaction?: string;
          /** account ids */
          reactors?: number[];
        }[];
      })[];
      more_available?: boolean;
    }>('FriendMessages.GetRecentMessages#1', {
      steamid1: cm.steamid,
      steamid2: chat.steamid,
      count: HISTORY_COUNT,
      most_recent_conversation: false,
      bbcode_format: true,
      time_last: last?.timestamp ?? LATEST,
      ordinal_last: last?.ordinal,
    });
    return {
      entries: messages.map((m) => ({
        ...m,
        accountId: m.accountid,
        reactions: (m.reactions ?? []).flatMap((r) => {
          const key = reactionKey(r.reaction_type, r.reaction);
          const reactors = (r.reactors ?? []).map(steamIdFromAccountId);
          return key
            ? [reaction(key, reactors.length, reactors.includes(cm.steamid))]
            : [];
        }),
      })),
      next: olderThan(more_available, messages.at(-1)),
    };
  }
  const { messages = [], more_available } = await cm.call<{
    messages?: {
      sender: number;
      server_timestamp?: number;
      message?: string;
      ordinal?: number;
      server_message?: object;
      deleted?: boolean;
      reactions?: {
        reaction_type?: number;
        reaction?: string;
        num_reactors?: number;
        has_user_reacted?: boolean;
      }[];
    }[];
    more_available?: boolean;
  }>('ChatRoom.GetMessageHistory#1', {
    chat_group_id: chat.groupId,
    chat_id: chat.chatId,
    max_count: HISTORY_COUNT,
    last_time: last?.timestamp,
    last_ordinal: last?.ordinal,
  });
  const oldest = messages.at(-1);
  return {
    entries: messages
      .filter((m) => !m.server_message && !m.deleted)
      .map((m) => ({
        accountId: m.sender,
        message: m.message,
        timestamp: m.server_timestamp,
        ordinal: m.ordinal,
        reactions: (m.reactions ?? []).flatMap((r) => {
          const key = reactionKey(r.reaction_type, r.reaction);
          return key
            ? [reaction(key, r.num_reactors ?? 0, r.has_user_reacted ?? false)]
            : [];
        }),
      })),
    // server and deleted messages too, older history starts before them
    next: olderThan(
      more_available,
      oldest && {
        timestamp: oldest.server_timestamp,
        ordinal: oldest.ordinal,
      },
    ),
  };
}
