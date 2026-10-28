import { describe, expect, it } from 'vitest';
import { EMsg, type SteamCM } from './cm.ts';
import { accountIdFromSteamId, FriendsList } from './friends.ts';
import { encodeProto } from './protos.ts';

const ME = '76561197960265729';
const ALICE = '76561197960265730';
const BOB = '76561197960265731';
const BLOCKED = '76561197960265732';
// EFriendRelationship
const FRIEND = 3;
const BLOCKED_RELATIONSHIP = 1;
const REMOVED = 0;
// EClientPersonaStateFlag
const STATUS = 1;
const NAME = 2;
const PRESENCE = 16;

/** Delivers encoded messages like Steam would, and records persona requests. */
function fakeSteam() {
  const handlers = new Map<
    number | string,
    (header: object, body: Uint8Array) => void
  >();
  const requested: string[][] = [];
  // the persona flags asked for, per request
  const flags: number[] = [];
  const cm = {
    onMessage(
      key: number | string,
      handler: (header: object, body: Uint8Array) => void,
    ) {
      handlers.set(key, handler);
      return () => {};
    },
    send(
      _emsg: number,
      _type: string,
      body: { friends: string[]; persona_state_requested: number },
    ) {
      requested.push(body.friends);
      flags.push(body.persona_state_requested);
    },
  };
  const deliver = (emsg: number | string, typeName: string, body: object) =>
    handlers.get(emsg)?.({}, encodeProto(typeName, body));
  return {
    cm: cm as unknown as SteamCM,
    requested,
    flags,
    friendsList: (bincremental: boolean, friends: [string, number][]) =>
      deliver(EMsg.ClientFriendsList, 'CMsgClientFriendsList', {
        bincremental,
        friends: friends.map(([ulfriendid, efriendrelationship]) => ({
          ulfriendid,
          efriendrelationship,
        })),
      }),
    nicknames: (
      message: { removal?: boolean; incremental?: boolean },
      nicknames: [string, string][],
    ) =>
      deliver(EMsg.ClientPlayerNicknameList, 'CMsgClientPlayerNicknameList', {
        ...message,
        nicknames: nicknames.map(([steamid, nickname]) => ({
          steamid,
          nickname,
        })),
      }),
    nicknameChanged: (accountid: number, nickname: string) =>
      deliver(
        'PlayerClient.NotifyFriendNicknameChanged#1',
        'CPlayer_FriendNicknameChanged_Notification',
        { accountid, nickname },
      ),
    personas: (status_flags: number, friends: object[]) =>
      deliver(EMsg.ClientPersonaState, 'CMsgClientPersonaState', {
        status_flags,
        friends,
      }),
  };
}

describe('FriendsList', () => {
  it('asks for everyone once logged on and lists friends with online ones first', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    // arrives together with the logon response, before the session is usable
    steam.friendsList(false, [
      [ALICE, FRIEND],
      [BOB, FRIEND],
      [BLOCKED, BLOCKED_RELATIONSHIP],
    ]);
    expect(steam.requested).toEqual([]);

    list.start(ME);
    steam.personas(STATUS | NAME | PRESENCE, [
      { friendid: ME, persona_state: 1, player_name: 'Me' },
      { friendid: ALICE, persona_state: 0, player_name: 'Alice' },
      {
        friendid: BOB,
        persona_state: 1,
        player_name: 'Bob',
        avatar_hash: new Uint8Array(20),
      },
    ]);

    expect(steam.requested).toEqual([[ME, ALICE, BOB, BLOCKED]]);
    expect(list.friends).toEqual([
      {
        steamid: BOB,
        name: 'Bob',
        nickname: null,
        // no avatar set, steam's default picture
        avatarUrl:
          'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
        online: true,
        away: null,
        game: null,
      },
      {
        steamid: ALICE,
        name: 'Alice',
        nickname: null,
        avatarUrl: null,
        online: false,
        away: null,
        game: null,
      },
    ]);
    expect(list.get(ME).name).toBe('Me');
  });

  it('keeps what an update leaves out', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    steam.personas(STATUS | NAME, [
      { friendid: ALICE, persona_state: 1, player_name: 'Alice' },
    ]);

    // a rename without the status flag says nothing about being online
    steam.personas(NAME, [{ friendid: ALICE, player_name: 'Alicia' }]);

    expect(list.friends).toEqual([
      expect.objectContaining({ name: 'Alicia', online: true }),
    ]);
  });

  it('tells about changes only when something shown changed', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    steam.personas(STATUS | NAME, [
      { friendid: ALICE, persona_state: 1, player_name: 'Alice' },
    ]);
    const alice = list.get(ALICE);
    let changes = 0;
    list.on('changed', () => changes++);

    // the same again
    steam.personas(STATUS | NAME, [
      { friendid: ALICE, persona_state: 1, player_name: 'Alice' },
    ]);
    expect(changes).toBe(0);
    expect(list.get(ALICE)).toBe(alice);

    steam.personas(STATUS, [{ friendid: ALICE, persona_state: 0 }]);
    expect(changes).toBe(1);
    expect(list.get(ALICE)).toEqual({ ...alice, online: false });
  });

  it('tells Away and Snooze from online', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    steam.friendsList(false, [
      [ALICE, FRIEND],
      [BOB, FRIEND],
    ]);

    steam.personas(STATUS, [
      { friendid: ALICE, persona_state: 3 },
      { friendid: BOB, persona_state: 4 },
    ]);

    expect(list.get(ALICE)).toMatchObject({ online: true, away: 'away' });
    expect(list.get(BOB)).toMatchObject({ online: true, away: 'snooze' });
  });

  it('shows the game a friend plays, Steam games named by the store once', async () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    const lookedUp: number[][] = [];
    let named = (_: { appid: number; name: string }[]) => {};
    list.nameGamesWith(
      (appids) =>
        new Promise((resolve) => {
          lookedUp.push(appids);
          named = resolve;
        }),
    );
    list.attach(steam.cm);
    steam.friendsList(false, [
      [ALICE, FRIEND],
      [BOB, FRIEND],
    ]);
    let changes = 0;
    list.on('changed', () => changes++);
    const playing = { persona_state: 1, gameid: '10', game_played_app_id: 10 };

    steam.personas(STATUS, [{ friendid: ALICE, ...playing }]);
    steam.personas(STATUS, [{ friendid: BOB, ...playing }]);
    expect(list.get(ALICE).game).toEqual({ appid: 10, name: null });

    named([{ appid: 10, name: 'Some Game' }]);
    await Promise.resolve();
    expect(lookedUp).toEqual([[10]]);
    expect(list.get(BOB).game).toEqual({ appid: 10, name: 'Some Game' });
    expect(changes).toBe(3);

    // a rename leaves the game out
    steam.personas(NAME, [{ friendid: ALICE, player_name: 'Alicia' }]);
    expect(list.get(ALICE).game).toEqual({ appid: 10, name: 'Some Game' });

    // non-Steam games come named, any app id they carry isn't the store's
    for (const game_played_app_id of [0, 3034873344]) {
      steam.personas(STATUS, [
        {
          friendid: ALICE,
          persona_state: 1,
          gameid: '13034681760015712256',
          game_played_app_id,
          game_name: 'A Shortcut',
        },
      ]);
      expect(list.get(ALICE).game).toEqual({ appid: null, name: 'A Shortcut' });
    }

    steam.personas(STATUS, [
      { friendid: ALICE, persona_state: 1, gameid: '0', game_played_app_id: 0 },
    ]);
    expect(list.get(ALICE).game).toBeNull();
    expect(lookedUp).toEqual([[10]]);

    steam.personas(STATUS, [{ friendid: BOB, persona_state: 0 }]);
    expect(list.get(BOB).game).toBeNull();
  });

  it('looks up a game again after the store failed to name it', async () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    let calls = 0;
    list.nameGamesWith(async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return [{ appid: 10, name: 'Some Game' }];
    });
    list.attach(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    const playing = { persona_state: 1, gameid: '10', game_played_app_id: 10 };

    steam.personas(STATUS, [{ friendid: ALICE, ...playing }]);
    await Promise.resolve();
    steam.personas(STATUS, [{ friendid: ALICE, ...playing }]);
    await Promise.resolve();

    expect(list.get(ALICE).game).toEqual({ appid: 10, name: 'Some Game' });
  });

  it('follows friends being added and removed after logon', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    list.start(ME);

    steam.friendsList(true, [
      [ALICE, REMOVED],
      [BOB, FRIEND],
    ]);

    expect(list.friends.map((f) => f.steamid)).toEqual([BOB]);
    expect(steam.requested.at(-1)).toEqual([BOB]);
  });

  it('never asks for statuses', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    list.start(ME);
    steam.friendsList(true, [[BOB, FRIEND]]);
    list.lookUp([BLOCKED]);

    // steam would send every session of the account everyone as offline, the official
    // clients then sign out of friends & chat and empty their friends lists
    expect(steam.flags).toEqual([
      NAME | PRESENCE,
      NAME | PRESENCE,
      NAME | PRESENCE,
    ]);
  });

  it('looks up strangers once', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    list.start(ME);
    steam.personas(STATUS | NAME, [{ friendid: ME, player_name: 'Me' }]);

    list.lookUp([BLOCKED, ME]);
    list.lookUp([BLOCKED]);

    expect(steam.requested).toEqual([[ME], [BLOCKED]]);
  });

  it('shows the last snapshot, everyone offline, until Steam sends the list and personas', () => {
    const before = fakeSteam();
    const last = new FriendsList();
    last.attach(before.cm);
    before.friendsList(false, [
      [ALICE, FRIEND],
      [BOB, FRIEND],
    ]);
    last.start(ME);
    before.personas(STATUS | NAME, [
      { friendid: ME, persona_state: 1, player_name: 'Me' },
      { friendid: ALICE, persona_state: 1, player_name: 'Alice' },
      { friendid: BOB, player_name: 'Bob' },
    ]);
    before.nicknames({}, [[ALICE, 'Ally']]);

    const list = new FriendsList();
    list.restore(last.snapshot());
    expect(list.get(ME).name).toBe('Me');
    expect(list.get(ALICE).nickname).toBe('Ally');
    // a status from last time may be long over
    expect(list.friends.map((f) => [f.name, f.online])).toEqual([
      ['Alice', false],
      ['Bob', false],
    ]);

    // Bob unfriended meanwhile
    const steam = fakeSteam();
    list.attach(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    expect(list.friends.map((f) => f.name)).toEqual(['Alice']);
    // and her nickname was taken off
    steam.nicknames({}, []);
    expect(list.get(ALICE).nickname).toBeNull();

    // steam pushes that she is online before her name comes
    list.start(ME);
    steam.personas(STATUS, [{ friendid: ALICE, persona_state: 1 }]);
    expect(list.friends).toEqual([
      expect.objectContaining({ name: 'Alice', online: true }),
    ]);

    steam.personas(NAME, [{ friendid: ALICE, player_name: 'Alicia' }]);
    expect(list.friends).toEqual([
      expect.objectContaining({ name: 'Alicia', online: true }),
    ]);
  });

  it('shows the nicknames Steam sends and follows changes to them', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.attach(steam.cm);
    steam.friendsList(false, [
      [ALICE, FRIEND],
      [BOB, FRIEND],
    ]);
    steam.nicknames({}, [[ALICE, 'Ally']]);
    expect(list.get(ALICE).nickname).toBe('Ally');
    expect(list.get(BOB).nickname).toBeNull();

    // set in another session, by account id
    steam.nicknameChanged(accountIdFromSteamId(BOB), 'Bobby');
    expect(list.get(BOB).nickname).toBe('Bobby');
    // an empty one clears it
    steam.nicknameChanged(accountIdFromSteamId(BOB), '');
    expect(list.get(BOB).nickname).toBeNull();

    steam.nicknames({ incremental: true }, [[BOB, 'Robert']]);
    steam.nicknames({ incremental: true, removal: true }, [[ALICE, 'Ally']]);
    expect(list.friends.map((f) => [f.name, f.nickname])).toEqual([
      [ALICE, null],
      [BOB, 'Robert'],
    ]);
  });

  it('asks for people looked up before logon once logged on', () => {
    const steam = fakeSteam();
    const list = new FriendsList();
    list.lookUp([BLOCKED]);
    list.attach(steam.cm);
    expect(steam.requested).toEqual([]);

    list.start(ME);

    expect(steam.requested).toEqual([[ME, BLOCKED]]);
  });
});
