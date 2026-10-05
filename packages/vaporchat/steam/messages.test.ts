import { describe, expect, it } from 'vitest';
import type { IncomingChatMessage } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import {
  getRecentMessages,
  mergeMessages,
  onChatMessages,
  sendMessage,
} from './messages.ts';
import { encodeProto } from './protos.ts';

// account ids 1 and 2 as SteamID64s
const ME = '76561197960265729';
const ALICE = '76561197960265730';
const FRIEND_MESSAGE = 'FriendMessagesClient.IncomingMessage#1';
const ROOM_MESSAGE = 'ChatRoomClient.NotifyIncomingChatMessage#1';
// EChatEntryType
const CHAT_MESSAGE = 1;
const TYPING = 2;

/** Delivers encoded notifications like Steam would, answers calls with canned responses. */
function fakeSteam(responses: Record<string, object> = {}) {
  const handlers = new Map<
    number | string,
    (header: object, body: Uint8Array) => void
  >();
  const sent: { message?: string }[] = [];
  const cm = {
    steamid: ME,
    onMessage(
      key: number | string,
      handler: (header: object, body: Uint8Array) => void,
    ) {
      handlers.set(key, handler);
      return () => {};
    },
    async call(method: string, body: { message?: string }) {
      sent.push(body);
      return responses[method] ?? {};
    },
  };
  const received: IncomingChatMessage[] = [];
  onChatMessages(cm as unknown as SteamCM, (incoming) =>
    received.push(incoming),
  );
  return {
    cm: cm as unknown as SteamCM,
    received,
    sent,
    deliver: (name: string, typeName: string, body: object) =>
      handlers.get(name)?.({}, encodeProto(typeName, body)),
  };
}

function friendMessage(message: string, extra: object = {}) {
  return {
    steamid_friend: ALICE,
    chat_entry_type: CHAT_MESSAGE,
    message,
    rtime32_server_timestamp: 1_700_000_000,
    ordinal: 0,
    ...extra,
  };
}

describe('incoming messages', () => {
  it('attributes friend messages, our echoes to us, and skips typing notices', () => {
    const steam = fakeSteam();
    const type = 'CFriendMessages_IncomingMessage_Notification';
    steam.deliver(
      FRIEND_MESSAGE,
      type,
      friendMessage('', { chat_entry_type: TYPING }),
    );
    steam.deliver(FRIEND_MESSAGE, type, friendMessage('hi'));
    steam.deliver(
      FRIEND_MESSAGE,
      type,
      friendMessage('hey', { local_echo: true, ordinal: 1 }),
    );
    expect(steam.received).toEqual([
      {
        chat: { kind: 'friend', steamid: ALICE },
        message: {
          id: '1700000000:0',
          sender: ALICE,
          parts: [{ kind: 'text', text: 'hi' }],
          time: 1_700_000_000_000,
        },
      },
      {
        chat: { kind: 'friend', steamid: ALICE },
        message: {
          id: '1700000000:1',
          sender: ME,
          parts: [{ kind: 'text', text: 'hey' }],
          time: 1_700_000_000_001,
        },
      },
    ]);
  });

  it('reads room messages and skips server messages like joins', () => {
    const steam = fakeSteam();
    const type = 'CChatRoom_IncomingChatMessage_Notification';
    const room = { chat_group_id: '7', chat_id: '8', steamid_sender: ALICE };
    steam.deliver(ROOM_MESSAGE, type, {
      ...room,
      timestamp: 1_700_000_000,
      server_message: { accountid_param: 2 },
    });
    steam.deliver(ROOM_MESSAGE, type, {
      ...room,
      message: 'hello room',
      timestamp: 1_700_000_001,
    });
    expect(steam.received).toEqual([
      {
        chat: { kind: 'room', groupId: '7', chatId: '8' },
        message: {
          id: '1700000001:0',
          sender: ALICE,
          parts: [{ kind: 'text', text: 'hello room' }],
          time: 1_700_000_001_000,
        },
      },
    ]);
  });
});

describe('sendMessage', () => {
  it('returns the message with the id its echo arrives with', async () => {
    const steam = fakeSteam({
      'FriendMessages.SendMessage#1': {
        modified_message: 'a \\[b]',
        server_timestamp: 1_700_000_000,
        ordinal: 2,
      },
    });
    const sent = await sendMessage(
      steam.cm,
      { kind: 'friend', steamid: ALICE },
      'a [b]',
    );
    steam.deliver(
      FRIEND_MESSAGE,
      'CFriendMessages_IncomingMessage_Notification',
      friendMessage('a \\[b]', { local_echo: true, ordinal: 2 }),
    );
    expect(sent).toEqual(steam.received[0].message);
    expect(sent.parts).toEqual([{ kind: 'text', text: 'a [b]' }]);
  });

  it('leaves emoticons and stickers for Steam to turn into BBCode', async () => {
    const steam = fakeSteam();
    const room = { kind: 'room', groupId: '7', chatId: '8' } as const;
    // tags we wrote ourselves would be dropped by Steam
    await sendMessage(steam.cm, room, 'gg :steamhappy: [x]');
    await sendMessage(steam.cm, room, {
      kind: 'sticker',
      name: 'Big Cat',
      url: 'https://example.com/sticker.png',
    });
    expect(steam.sent.map((body) => body.message)).toEqual([
      'gg :steamhappy: \\[x]',
      '/sticker Big Cat',
    ]);
  });
});

describe('getRecentMessages', () => {
  it('lists friend history oldest first with senders as SteamID64s', async () => {
    const steam = fakeSteam({
      // steam sends the newest first
      'FriendMessages.GetRecentMessages#1': {
        messages: [
          { accountid: 1, timestamp: 1_700_000_005, message: 'second' },
          { accountid: 2, timestamp: 1_700_000_000, message: 'first' },
        ],
      },
    });
    const messages = await getRecentMessages(steam.cm, {
      kind: 'friend',
      steamid: ALICE,
    });
    expect(messages.map((m) => [m.sender, m.parts])).toEqual([
      [ALICE, [{ kind: 'text', text: 'first' }]],
      [ME, [{ kind: 'text', text: 'second' }]],
    ]);
  });

  it('leaves server and deleted messages out of room history', async () => {
    const steam = fakeSteam({
      'ChatRoom.GetMessageHistory#1': {
        messages: [
          { sender: 2, server_timestamp: 3, message: 'kept' },
          { sender: 2, server_timestamp: 2, message: 'gone', deleted: true },
          { sender: 2, server_timestamp: 1, server_message: { message: 1 } },
        ],
      },
    });
    const messages = await getRecentMessages(steam.cm, {
      kind: 'room',
      groupId: '7',
      chatId: '8',
    });
    expect(messages.map((m) => m.parts)).toEqual([
      [{ kind: 'text', text: 'kept' }],
    ]);
  });
});

describe('mergeMessages', () => {
  it('keeps one of each message, in the order Steam numbered them', () => {
    const steam = fakeSteam();
    const type = 'CFriendMessages_IncomingMessage_Notification';
    for (const ordinal of [10, 2, 10]) {
      steam.deliver(
        FRIEND_MESSAGE,
        type,
        friendMessage(`#${ordinal}`, { ordinal }),
      );
    }
    const merged = mergeMessages(
      [],
      steam.received.map((incoming) => incoming.message),
    );
    expect(merged.map((m) => m.id)).toEqual(['1700000000:2', '1700000000:10']);
  });
});
