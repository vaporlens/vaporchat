import { Emitter } from '../client/emitter.ts';
import type { ChatTarget, Unread } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import { steamIdFromAccountId } from './friends.ts';
import { chatKey, fromMessageTime, onChatMessages } from './messages.ts';
import { decodeProto } from './protos.ts';

interface MessageSessions {
  message_sessions?: {
    accountid_friend: number;
    unread_message_count?: number;
  }[];
}

interface MyChatRoomGroups {
  chat_room_groups?: {
    user_chat_group_state?: {
      unread_indicator_muted?: boolean;
      user_chat_room_state?: {
        chat_id: string;
        time_joined?: number;
        time_last_ack?: number;
        unread_indicator_muted?: boolean;
      }[];
    };
    group_summary?: {
      chat_group_id: string;
      chat_rooms?: { chat_id: string; time_last_message?: number }[];
    };
  }[];
}

interface FriendAck {
  steamid_partner: string;
}

interface RoomAck {
  chat_group_id: string;
  chat_id: string;
}

/**
 * What is unread now, by Steam's own count for friends and its last read time for rooms. Rooms
 * whose unread indicator is muted, or in a group muted so, are `muted` instead.
 */
export async function getUnread(
  cm: SteamCM,
): Promise<{ unread: Unread; muted: Set<string> }> {
  const [{ message_sessions = [] }, { chat_room_groups = [] }] =
    await Promise.all([
      cm.call<MessageSessions>('FriendMessages.GetActiveMessageSessions#1', {
        only_sessions_with_messages: true,
      }),
      cm.call<MyChatRoomGroups>('ChatRoom.GetMyChatRoomGroups#1', {}),
    ]);
  const friends = new Map<string, number>();
  for (const session of message_sessions) {
    if (session.unread_message_count)
      friends.set(
        steamIdFromAccountId(session.accountid_friend),
        session.unread_message_count,
      );
  }
  const rooms = new Set<string>();
  const muted = new Set<string>();
  for (const { user_chat_group_state, group_summary } of chat_room_groups) {
    if (!group_summary) continue;
    for (const room of group_summary.chat_rooms ?? []) {
      const mine = user_chat_group_state?.user_chat_room_state?.find(
        (state) => state.chat_id === room.chat_id,
      );
      const key = chatKey({
        kind: 'room',
        groupId: group_summary.chat_group_id,
        chatId: room.chat_id,
      });
      // a room never read counts from joining it
      const read = mine?.time_last_ack ?? mine?.time_joined ?? 0;
      if (
        user_chat_group_state?.unread_indicator_muted ||
        mine?.unread_indicator_muted
      )
        muted.add(key);
      else if ((room.time_last_message ?? 0) > read) rooms.add(key);
    }
  }
  return { unread: { friends, rooms }, muted };
}

/**
 * Unread messages per chat, kept like Steam keeps them for all the account's devices: what was
 * unread at logon, messages from others since, minus chats read here or elsewhere.
 */
export class UnreadChats extends Emitter<{ changed: Unread }> {
  #cm: SteamCM | null = null;
  #unread: Unread = { friends: new Map(), rooms: new Set() };
  /** rooms never unread, as set in Steam when logging on */
  #muted = new Set<string>();
  /** reads until Steam said what is unread, its answer would bring them back */
  #pending: Map<string, { chat: ChatTarget; time: number }> | null = new Map();

  get current() {
    return this.#unread;
  }

  /** Once logged on: follows messages and reads on other devices, then asks Steam what is unread. */
  async start(cm: SteamCM) {
    this.#cm = cm;
    onChatMessages(cm, ({ chat, message }) => {
      if (message.sender !== cm.steamid && !this.#muted.has(chatKey(chat)))
        this.#update(chat, 'add');
    });
    cm.onMessage('FriendMessagesClient.NotifyAckMessageEcho#1', (_h, body) => {
      const ack = decodeProto<FriendAck>(
        'CFriendMessages_AckMessage_Notification',
        body,
      );
      this.#update({ kind: 'friend', steamid: ack.steamid_partner }, 'read');
    });
    cm.onMessage('ChatRoomClient.NotifyAckChatMessageEcho#1', (_h, body) => {
      const ack = decodeProto<RoomAck>(
        'CChatRoom_AckChatMessage_Notification',
        body,
      );
      this.#update(
        { kind: 'room', groupId: ack.chat_group_id, chatId: ack.chat_id },
        'read',
      );
    });
    try {
      // steam's count includes what arrived while it was asked
      ({ unread: this.#unread, muted: this.#muted } = await getUnread(cm));
      this.emit('changed', this.#unread);
    } finally {
      // without its answer, the reads are still worth telling
      const pending = this.#pending ?? new Map();
      this.#pending = null;
      for (const { chat, time } of pending.values()) this.markRead(chat, time);
    }
  }

  /** Marks a chat read up to a message's `time`, here and on the account's other devices. */
  markRead(chat: ChatTarget, time: number) {
    this.#update(chat, 'read');
    if (this.#pending) {
      this.#pending.set(chatKey(chat), { chat, time });
      return;
    }
    // a lost connection (Android drops it in the background) is replaced, the chat reads again then
    if (!this.#cm?.connected) return;
    const { timestamp } = fromMessageTime(time);
    if (chat.kind === 'friend')
      this.#cm.notify(
        'FriendMessages.AckMessage#1',
        'CFriendMessages_AckMessage_Notification',
        { steamid_partner: chat.steamid, timestamp },
      );
    else
      this.#cm.notify(
        'ChatRoom.AckChatMessage#1',
        'CChatRoom_AckChatMessage_Notification',
        { chat_group_id: chat.groupId, chat_id: chat.chatId, timestamp },
      );
  }

  #update(chat: ChatTarget, change: 'add' | 'read') {
    const friends = new Map(this.#unread.friends);
    const rooms = new Set(this.#unread.rooms);
    if (chat.kind === 'friend') {
      const count = friends.get(chat.steamid) ?? 0;
      if (change === 'read' && count === 0) return;
      if (change === 'add') friends.set(chat.steamid, count + 1);
      else friends.delete(chat.steamid);
    } else {
      const key = chatKey(chat);
      // already so
      if (rooms.has(key) === (change === 'add')) return;
      if (change === 'add') rooms.add(key);
      else rooms.delete(key);
    }
    this.#unread = { friends, rooms };
    this.emit('changed', this.#unread);
  }
}
