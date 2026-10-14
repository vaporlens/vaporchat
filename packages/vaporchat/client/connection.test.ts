import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMsg, type SteamCM } from '../steam/cm.ts';
import type { Friend } from '../steam/friends.ts';
import type { LogOnOptions } from '../steam/logOn.ts';
import { encodeProto } from '../steam/protos.ts';
import { VoiceConnection } from './connection.ts';

const ME = '76561197960265729';
const ALICE = '76561197960265730';
const BOB = '76561197960265731';
// EFriendRelationship
const FRIEND = 3;
// EClientPersonaStateFlag
const STATUS = 1;
const NAME = 2;

type Handler = (header: object, body: Uint8Array) => void;
const handlers = new Map<number | string, Handler>();

// the connection logging on, never done: only its friends' messages get through
vi.mock('../steam/logOn.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../steam/logOn.ts')>()),
  steamIdFromRefreshToken: () => ME,
  logOnSteam: (_store: object, { beforeLogOn }: LogOnOptions) => {
    beforeLogOn?.({
      onMessage(key: number | string, handler: Handler) {
        handlers.set(key, handler);
        return () => {};
      },
      send() {},
    } as unknown as SteamCM);
    return new Promise(() => {});
  },
}));

function deliver(emsg: number, typeName: string, body: object) {
  handlers.get(emsg)?.({}, encodeProto(typeName, body));
}

async function connectionWithFriends() {
  const connection = await VoiceConnection.start({
    load: async () => 'stored token',
    save: async () => {},
  });
  deliver(EMsg.ClientFriendsList, 'CMsgClientFriendsList', {
    bincremental: false,
    friends: [ALICE, BOB].map((ulfriendid) => ({
      ulfriendid,
      efriendrelationship: FRIEND,
    })),
  });
  const told: Friend[][] = [];
  connection.on('friendsChanged', (friends) => told.push(friends));
  return { connection, told };
}

// steam sends each friend's status as its own message
function comeOnline(steamid: string, name: string) {
  deliver(EMsg.ClientPersonaState, 'CMsgClientPersonaState', {
    status_flags: STATUS | NAME,
    friends: [{ friendid: steamid, persona_state: 1, player_name: name }],
  });
}

describe('VoiceConnection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    handlers.clear();
  });

  it('tells about a burst of friends changes once', async () => {
    const { told } = await connectionWithFriends();

    comeOnline(ALICE, 'Alice');
    comeOnline(BOB, 'Bob');
    expect(told).toEqual([]);

    vi.runAllTimers();
    expect(told).toEqual([
      [
        expect.objectContaining({ name: 'Alice', online: true }),
        expect.objectContaining({ name: 'Bob', online: true }),
      ],
    ]);
  });

  it('tells nothing once closed', async () => {
    const { connection, told } = await connectionWithFriends();

    comeOnline(ALICE, 'Alice');
    connection.close();

    vi.runAllTimers();
    expect(told).toEqual([]);
  });
});
