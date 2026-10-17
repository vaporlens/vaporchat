import { describe, expect, it } from 'vitest';
import type { Unread } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import { encodeProto } from './protos.ts';
import { UnreadChats } from './unread.ts';

// account ids 1, 2 and 3 as SteamID64s
const ME = '76561197960265729';
const ALICE = '76561197960265730';
const BOB = '76561197960265731';
const ROOM = { kind: 'room', groupId: '7', chatId: '70' } as const;
const ROOM_KEY = '7:70';
// EChatEntryType.ChatMsg
const CHAT_MESSAGE = 1;

/** Answers calls with canned responses, delivers notifications, records what was sent. */
function fakeSteam(responses: Record<string, object> = {}) {
  const handlers = new Map<
    number | string,
    (header: object, body: Uint8Array) => void
  >();
  const notified: { method: string; body: object }[] = [];
  const cm = {
    steamid: ME,
    connected: true,
    onMessage(
      key: number | string,
      handler: (header: object, body: Uint8Array) => void,
    ) {
      handlers.set(key, handler);
      return () => {};
    },
    async call(method: string) {
      return responses[method] ?? {};
    },
    notify(method: string, _typeName: string, body: object) {
      notified.push({ method, body });
    },
  };
  const deliver = (name: string, typeName: string, body: object) =>
    handlers.get(name)?.({}, encodeProto(typeName, body));
  return {
    cm: cm as unknown as SteamCM,
    notified,
    friendMessage: (from: string, extra: object = {}) =>
      deliver(
        'FriendMessagesClient.IncomingMessage#1',
        'CFriendMessages_IncomingMessage_Notification',
        {
          steamid_friend: from,
          chat_entry_type: CHAT_MESSAGE,
          message: 'hi',
          ...extra,
        },
      ),
    roomMessage: (from: string, extra: object = {}) =>
      deliver(
        'ChatRoomClient.NotifyIncomingChatMessage#1',
        'CChatRoom_IncomingChatMessage_Notification',
        {
          chat_group_id: ROOM.groupId,
          chat_id: ROOM.chatId,
          steamid_sender: from,
          message: 'hi',
          ...extra,
        },
      ),
    readElsewhere: (steamid_partner: string) =>
      deliver(
        'FriendMessagesClient.NotifyAckMessageEcho#1',
        'CFriendMessages_AckMessage_Notification',
        { steamid_partner, timestamp: 1_700_000_000 },
      ),
    roomReadElsewhere: () =>
      deliver(
        'ChatRoomClient.NotifyAckChatMessageEcho#1',
        'CChatRoom_AckChatMessage_Notification',
        {
          chat_group_id: ROOM.groupId,
          chat_id: ROOM.chatId,
          timestamp: 1_700_000_000,
        },
      ),
  };
}

function shown({ friends, rooms }: Unread) {
  return { friends: Object.fromEntries(friends), rooms: [...rooms] };
}

describe('UnreadChats', () => {
  it("starts from Steam's counts for friends and last read times for rooms", async () => {
    const steam = fakeSteam({
      'FriendMessages.GetActiveMessageSessions#1': {
        message_sessions: [
          { accountid_friend: 2, unread_message_count: 3 },
          { accountid_friend: 3, unread_message_count: 0 },
        ],
      },
      'ChatRoom.GetMyChatRoomGroups#1': {
        chat_room_groups: [
          {
            user_chat_group_state: {
              user_chat_room_state: [
                { chat_id: '70', time_last_ack: 100 },
                { chat_id: '71', time_last_ack: 200 },
                // never read since joining
                { chat_id: '72', time_joined: 100 },
              ],
            },
            group_summary: {
              chat_group_id: '7',
              chat_rooms: [
                { chat_id: '70', time_last_message: 150 },
                { chat_id: '71', time_last_message: 150 },
                { chat_id: '72', time_last_message: 150 },
              ],
            },
          },
        ],
      },
    });
    const unread = new UnreadChats();

    await unread.start(steam.cm);

    expect(shown(unread.current)).toEqual({
      friends: { [ALICE]: 3 },
      rooms: [ROOM_KEY, '7:72'],
    });
  });

  it('leaves out rooms with their unread indicator muted, or in a muted group', async () => {
    const steam = fakeSteam({
      'ChatRoom.GetMyChatRoomGroups#1': {
        chat_room_groups: [
          {
            user_chat_group_state: {
              user_chat_room_state: [
                { chat_id: '70', time_last_ack: 100 },
                {
                  chat_id: '71',
                  time_last_ack: 100,
                  unread_indicator_muted: true,
                },
              ],
            },
            group_summary: {
              chat_group_id: '7',
              chat_rooms: [
                { chat_id: '70', time_last_message: 150 },
                { chat_id: '71', time_last_message: 150 },
              ],
            },
          },
          {
            user_chat_group_state: {
              unread_indicator_muted: true,
              user_chat_room_state: [{ chat_id: '80', time_last_ack: 100 }],
            },
            group_summary: {
              chat_group_id: '8',
              chat_rooms: [{ chat_id: '80', time_last_message: 150 }],
            },
          },
        ],
      },
    });
    const unread = new UnreadChats();
    await unread.start(steam.cm);
    unread.markRead(ROOM, 1_700_000_000_000);

    steam.roomMessage(BOB, { chat_id: '71' });
    steam.roomMessage(BOB, { chat_group_id: '8', chat_id: '80' });
    steam.roomMessage(BOB);

    expect(shown(unread.current)).toEqual({ friends: {}, rooms: [ROOM_KEY] });
  });

  it('counts messages from others, not ours from other devices', async () => {
    const steam = fakeSteam();
    const unread = new UnreadChats();
    await unread.start(steam.cm);
    const told: Unread[] = [];
    unread.on('changed', (current) => told.push(current));

    steam.friendMessage(ALICE);
    steam.friendMessage(ALICE);
    steam.friendMessage(ALICE, { local_echo: true });
    steam.roomMessage(BOB);
    steam.roomMessage(ME);
    steam.roomMessage(BOB);

    expect(shown(unread.current)).toEqual({
      friends: { [ALICE]: 2 },
      rooms: [ROOM_KEY],
    });
    // a room already unread stays as it was
    expect(told).toHaveLength(3);
  });

  it('forgets chats read on another device', async () => {
    const steam = fakeSteam();
    const unread = new UnreadChats();
    await unread.start(steam.cm);
    steam.friendMessage(ALICE);
    steam.friendMessage(BOB);
    steam.roomMessage(BOB);

    steam.readElsewhere(ALICE);
    steam.roomReadElsewhere();

    expect(shown(unread.current)).toEqual({ friends: { [BOB]: 1 }, rooms: [] });
  });

  it('marks chats read on Steam up to a message', async () => {
    const steam = fakeSteam();
    const unread = new UnreadChats();
    await unread.start(steam.cm);
    steam.friendMessage(ALICE);
    steam.roomMessage(BOB);

    // a message's time is its server timestamp in milliseconds plus its ordinal
    unread.markRead({ kind: 'friend', steamid: ALICE }, 1_700_000_000_002);
    unread.markRead(ROOM, 1_700_000_100_000);

    expect(shown(unread.current)).toEqual({ friends: {}, rooms: [] });
    expect(steam.notified).toEqual([
      {
        method: 'FriendMessages.AckMessage#1',
        body: { steamid_partner: ALICE, timestamp: 1_700_000_000 },
      },
      {
        method: 'ChatRoom.AckChatMessage#1',
        body: { chat_group_id: '7', chat_id: '70', timestamp: 1_700_000_100 },
      },
    ]);
  });

  it("tells Steam about chats read while logging on once it said what's unread", async () => {
    const steam = fakeSteam({
      'FriendMessages.GetActiveMessageSessions#1': {
        message_sessions: [{ accountid_friend: 2, unread_message_count: 1 }],
      },
    });
    const unread = new UnreadChats();

    unread.markRead({ kind: 'friend', steamid: ALICE }, 1_700_000_000_000);
    const started = unread.start(steam.cm);
    expect(steam.notified).toEqual([]);
    await started;

    expect(shown(unread.current)).toEqual({ friends: {}, rooms: [] });
    expect(steam.notified).toEqual([
      {
        method: 'FriendMessages.AckMessage#1',
        body: { steamid_partner: ALICE, timestamp: 1_700_000_000 },
      },
    ]);
  });

  it('reads without telling Steam once the connection is lost', async () => {
    const steam = fakeSteam();
    const unread = new UnreadChats();
    await unread.start(steam.cm);
    steam.friendMessage(ALICE);
    (steam.cm as { connected: boolean }).connected = false;

    unread.markRead({ kind: 'friend', steamid: ALICE }, 1_700_000_000_000);

    expect(shown(unread.current)).toEqual({ friends: {}, rooms: [] });
    expect(steam.notified).toEqual([]);
  });
});
