import { describe, expect, it } from 'vitest';
import type {
  ChatMessage,
  IncomingChatMessage,
  ReactionChange,
} from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import {
  applyReaction,
  getRecentMessages,
  mergeMessages,
  onChatMessages,
  onReactions,
  onTyping,
  react,
  sendMessage,
  sendTyping,
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
          reactions: [],
        },
        mentioned: false,
      },
      {
        chat: { kind: 'friend', steamid: ALICE },
        message: {
          id: '1700000000:1',
          sender: ME,
          parts: [{ kind: 'text', text: 'hey' }],
          time: 1_700_000_000_001,
          reactions: [],
        },
        mentioned: false,
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
          reactions: [],
        },
        mentioned: false,
      },
    ]);
  });

  it('tells room messages that mention us, everyone or who is here', () => {
    const steam = fakeSteam();
    const type = 'CChatRoom_IncomingChatMessage_Notification';
    const mentioning = (mentions: object) =>
      steam.deliver(ROOM_MESSAGE, type, {
        chat_group_id: '7',
        chat_id: '8',
        steamid_sender: ALICE,
        message: 'hey',
        mentions,
      });
    mentioning({ mention_accountids: [2] });
    mentioning({ mention_accountids: [1] });
    mentioning({ mention_all: true });
    mentioning({ mention_here: true });
    expect(steam.received.map((incoming) => incoming.mentioned)).toEqual([
      false,
      true,
      true,
      true,
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

  it('sends mentions as BBCode, other brackets escaped', async () => {
    const steam = fakeSteam();
    const room = { kind: 'room', groupId: '7', chatId: '8' } as const;
    await sendMessage(
      steam.cm,
      room,
      '[mention=5]@[A] Bob[/mention] and [mention=all]@all[/mention] [x]',
    );
    expect(steam.sent[0].message).toBe(
      '[mention=5]@\\[A] Bob[/mention] and [mention=all]@all[/mention] \\[x]',
    );
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
    const { items } = await getRecentMessages(steam.cm, {
      kind: 'friend',
      steamid: ALICE,
    });
    expect(items.map((m) => [m.sender, m.parts])).toEqual([
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
    const { items } = await getRecentMessages(steam.cm, {
      kind: 'room',
      groupId: '7',
      chatId: '8',
    });
    expect(items.map((m) => m.parts)).toEqual([
      [{ kind: 'text', text: 'kept' }],
    ]);
  });

  it('continues before the oldest message, server messages included', async () => {
    const room = { kind: 'room', groupId: '7', chatId: '8' } as const;
    const steam = fakeSteam({
      'ChatRoom.GetMessageHistory#1': {
        messages: [
          { sender: 2, server_timestamp: 9, ordinal: 0, message: 'newest' },
          { sender: 2, server_timestamp: 5, ordinal: 2, server_message: {} },
        ],
        more_available: true,
      },
    });
    const { next } = await getRecentMessages(steam.cm, room);
    await getRecentMessages(steam.cm, room, next);
    expect(steam.sent[1]).toMatchObject({ last_time: 5, last_ordinal: 2 });
  });

  it('has nothing older when Steam has no more', async () => {
    const steam = fakeSteam({
      'FriendMessages.GetRecentMessages#1': {
        messages: [{ accountid: 2, timestamp: 1, message: 'only' }],
        more_available: false,
      },
    });
    const page = await getRecentMessages(steam.cm, {
      kind: 'friend',
      steamid: ALICE,
    });
    expect(page.next).toBeNull();
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

  it('tells when a friend types to us, not when we type on another device', () => {
    const steam = fakeSteam();
    const typing: string[] = [];
    onTyping(steam.cm, (steamid) => typing.push(steamid));
    const notice = {
      steamid_friend: ALICE,
      chat_entry_type: TYPING,
      rtime32_server_timestamp: 1_700_000_000,
    };

    steam.deliver(
      FRIEND_MESSAGE,
      'CFriendMessages_IncomingMessage_Notification',
      notice,
    );
    steam.deliver(
      FRIEND_MESSAGE,
      'CFriendMessages_IncomingMessage_Notification',
      { ...notice, local_echo: true },
    );
    steam.deliver(
      FRIEND_MESSAGE,
      'CFriendMessages_IncomingMessage_Notification',
      friendMessage('hi'),
    );

    expect(typing).toEqual([ALICE]);
  });

  it('sends typing as a typing notice, not a message', async () => {
    const steam = fakeSteam();

    await sendTyping(steam.cm, ALICE);

    expect(steam.sent).toEqual([{ steamid: ALICE, chat_entry_type: TYPING }]);
  });
});

describe('reactions', () => {
  const ECONOMY = 'https://community.fastly.steamstatic.com/economy';
  const HAPPY = { kind: 'emoticon', name: 'steamhappy' } as const;
  const happy = (count: number, mine: boolean) => ({
    ...HAPPY,
    url: `${ECONOMY}/emoticonlarge/steamhappy`,
    count,
    mine,
  });
  const message: ChatMessage = {
    id: '1700000000:0',
    sender: ALICE,
    parts: [],
    time: 1_700_000_000_000,
    reactions: [],
  };

  it('reads who reacted in friend history, and that we did', async () => {
    const steam = fakeSteam({
      'FriendMessages.GetRecentMessages#1': {
        messages: [
          {
            accountid: 2,
            timestamp: 1,
            message: 'hi',
            reactions: [
              { reaction_type: 1, reaction: ':steamhappy:', reactors: [1, 2] },
              // a kind this doesn't know
              { reaction_type: 9, reaction: 'x', reactors: [2] },
            ],
          },
        ],
      },
    });
    const { items } = await getRecentMessages(steam.cm, {
      kind: 'friend',
      steamid: ALICE,
    });
    expect(items[0].reactions).toEqual([happy(2, true)]);
  });

  it('reads reaction counts in room history', async () => {
    const steam = fakeSteam({
      'ChatRoom.GetMessageHistory#1': {
        messages: [
          {
            sender: 2,
            server_timestamp: 1,
            message: 'hi',
            reactions: [
              {
                reaction_type: 2,
                reaction: 'Big Cat',
                num_reactors: 3,
                has_user_reacted: false,
              },
            ],
          },
        ],
      },
    });
    const { items } = await getRecentMessages(steam.cm, {
      kind: 'room',
      groupId: '7',
      chatId: '8',
    });
    expect(items[0].reactions).toEqual([
      {
        kind: 'sticker',
        name: 'Big Cat',
        url: `${ECONOMY}/sticker/Big%20Cat`,
        count: 3,
        mine: false,
      },
    ]);
  });

  it('counts others reacting, ours once even when Steam echoes it', () => {
    const others = applyReaction(
      message,
      { reaction: HAPPY, reactor: ALICE, added: true },
      ME,
    );
    const ours = applyReaction(
      others,
      { reaction: HAPPY, reactor: ME, added: true },
      ME,
    );
    const echo = applyReaction(
      ours,
      { reaction: HAPPY, reactor: ME, added: true },
      ME,
    );
    expect(others.reactions).toEqual([happy(1, false)]);
    expect(ours.reactions).toEqual([happy(2, true)]);
    expect(echo).toBe(ours);
  });

  it('drops a reaction once nobody has it on', () => {
    const on = applyReaction(
      message,
      { reaction: HAPPY, reactor: ME, added: true },
      ME,
    );
    const off = applyReaction(
      on,
      { reaction: HAPPY, reactor: ME, added: false },
      ME,
    );
    expect(off.reactions).toEqual([]);
  });

  it('tells reactions in friend chats with the message they are on', () => {
    const steam = fakeSteam();
    const changes: ReactionChange[] = [];
    onReactions(steam.cm, (change) => changes.push(change));

    steam.deliver(
      'FriendMessagesClient.MessageReaction#1',
      'CFriendMessages_MessageReaction_Notification',
      {
        steamid_friend: ALICE,
        server_timestamp: 1_700_000_000,
        ordinal: 0,
        reactor: ALICE,
        reaction_type: 1,
        reaction: ':steamhappy:',
        is_add: true,
      },
    );

    expect(changes).toEqual([
      {
        chat: { kind: 'friend', steamid: ALICE },
        messageId: '1700000000:0',
        reaction: HAPPY,
        reactor: ALICE,
        added: true,
      },
    ]);
  });

  it('reacts to the message Steam knows by its time', async () => {
    const steam = fakeSteam();

    await react(
      steam.cm,
      { kind: 'room', groupId: '7', chatId: '8' },
      { time: 1_700_000_000_003 },
      HAPPY,
      false,
    );

    expect(steam.sent).toEqual([
      {
        chat_group_id: '7',
        chat_id: '8',
        server_timestamp: 1_700_000_000,
        ordinal: 3,
        reaction_type: 1,
        reaction: ':steamhappy:',
        is_add: false,
      },
    ]);
  });
});
