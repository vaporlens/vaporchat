import { describe, expect, it } from 'vitest';
import { EMsg, type SteamCM } from './cm.ts';
import { FriendsList } from './friends.ts';
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
  const deliver = (emsg: number, typeName: string, body: object) =>
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
    const list = new FriendsList(steam.cm);
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

    expect(steam.requested).toEqual([[ALICE, BOB, BLOCKED], [ME]]);
    expect(list.friends).toEqual([
      {
        steamid: BOB,
        name: 'Bob',
        // no avatar set, steam's default picture
        avatarUrl:
          'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
        online: true,
      },
      { steamid: ALICE, name: 'Alice', avatarUrl: null, online: false },
    ]);
    expect(list.get(ME).name).toBe('Me');
  });

  it('keeps what an update leaves out', () => {
    const steam = fakeSteam();
    const list = new FriendsList(steam.cm);
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

  it('follows friends being added and removed after logon', () => {
    const steam = fakeSteam();
    const list = new FriendsList(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    list.start(ME);

    steam.friendsList(true, [
      [ALICE, REMOVED],
      [BOB, FRIEND],
    ]);

    expect(list.friends.map((f) => f.steamid)).toEqual([BOB]);
    expect(steam.requested.at(-1)).toEqual([BOB]);
  });

  it('never asks for the status of the logged on account', () => {
    const steam = fakeSteam();
    const list = new FriendsList(steam.cm);
    steam.friendsList(false, [[ALICE, FRIEND]]);
    list.start(ME);
    list.lookUp([ME, BOB]);

    // steam would send every session of the account an offline status, and the
    // official clients sign out of friends & chat on it
    const askedForMe = steam.flags.filter((_, i) =>
      steam.requested[i].includes(ME),
    );
    expect(askedForMe).toEqual([NAME | PRESENCE]);
    expect(steam.requested.flat().sort()).toEqual([ME, ALICE, BOB]);
  });

  it('looks up strangers once', () => {
    const steam = fakeSteam();
    const list = new FriendsList(steam.cm);
    list.start(ME);
    steam.personas(STATUS | NAME, [{ friendid: ME, player_name: 'Me' }]);

    list.lookUp([BLOCKED, ME]);
    list.lookUp([BLOCKED]);

    expect(steam.requested).toEqual([[ME], [BLOCKED]]);
  });
});
