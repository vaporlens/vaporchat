import { Emitter } from '../client/emitter.ts';
import type { Friend, PlayedGame, StoreItem } from '../protocol.ts';
import { EMsg, type SteamCM } from './cm.ts';
import { decodeProto } from './protos.ts';

// EFriendRelationship.Friend, the rest are pending/blocked/ignored
const RELATIONSHIP_FRIEND = 3;
const RELATIONSHIP_NONE = 0;
// EClientPersonaStateFlag.Status
const PERSONA_STATUS = 1;
// PlayerName | Presence (avatar). Never Status: steam sends the answer to all the account's sessions with everyone offline,
// which signs the official clients out of friends & chat and empties their friends lists.
// Steam pushes the status of online friends by itself.
const PERSONA_FLAGS = 2 | 16;
// EPersonaState
const OFFLINE = 0;
const AWAY = 3;
const SNOOZE = 4;
// steam sends all zeros for accounts that never set an avatar, this is its default picture
const DEFAULT_AVATAR_HASH = 'fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb';

interface FriendsListMessage {
  bincremental?: boolean;
  friends?: { ulfriendid: string; efriendrelationship?: number }[];
}

interface NicknameListMessage {
  /** the listed nicknames were taken off */
  removal?: boolean;
  /** only changes, otherwise all of them */
  incremental?: boolean;
  nicknames?: { steamid: string; nickname?: string }[];
}

interface PersonaStateMessage {
  status_flags?: number;
  friends?: {
    friendid: string;
    persona_state?: number;
    player_name?: string;
    avatar_hash?: Uint8Array;
    /** "0" when not playing */
    gameid?: string;
    /** 0 for non-Steam games */
    game_played_app_id?: number;
    /** only for non-Steam games, empty for Steam's */
    game_name?: string;
  }[];
}

/** Names Steam games by appid, see `FriendsList.nameGamesWith`. */
type GameLookUp = (
  appids: number[],
) => Promise<Pick<StoreItem, 'appid' | 'name'>[]>;

/** What a `FriendsList` knew, to show on the next start until Steam sends it again. */
export interface FriendsSnapshot {
  friendIds: string[];
  users: Friend[];
}

interface Persona {
  name?: string;
  avatarHash?: string;
  state: number;
  game: PlayedGame | null;
}

// SteamID64 of individual account 0, account ids are offsets from it
const STEAMID64_BASE = 76561197960265728n;

export function steamIdFromAccountId(accountId: number) {
  return (STEAMID64_BASE + BigInt(accountId)).toString();
}

export function accountIdFromSteamId(steamid: string) {
  return Number(BigInt(steamid) - STEAMID64_BASE);
}

function playedGame({
  gameid,
  game_played_app_id,
  game_name,
}: NonNullable<PersonaStateMessage['friends']>[number]): PlayedGame | null {
  if (gameid === '0') return null;
  return { appid: game_played_app_id || null, name: game_name || null };
}

export function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// the avatar host Steam's Web API uses today, steam-user's older akamai path serves the same files
export function avatarUrl(hash: string) {
  const shown = /^0+$/.test(hash) ? DEFAULT_AVATAR_HASH : hash;
  return `https://avatars.steamstatic.com/${shown}_full.jpg`;
}

/**
 * The account's friends and their personas (name, avatar, online state), kept up to date
 * from what Steam pushes. Attach it before logging on, Steam sends the list right away.
 */
export class FriendsList extends Emitter<{ changed: Record<string, never> }> {
  #cm: SteamCM | null = null;
  #relationships = new Map<string, number>();
  #personas = new Map<string, Persona>();
  /** from `restore`, fills in what steam hasn't sent (again) yet */
  #restored = new Map<string, Friend>();
  #requested = new Set<string>();
  /** by steamid, the user's own names for people */
  #nicknames = new Map<string, string>();
  /** what `get` gave out last, the same object until something it shows changes */
  #shown = new Map<string, Friend>();
  #started = false;
  #lookUpGames: GameLookUp | null = null;
  /** by appid, null while looked up and for games the store doesn't show */
  #gameNames = new Map<number, string | null>();

  /** Listens to a connection that is about to log on. */
  attach(cm: SteamCM) {
    this.#cm = cm;
    cm.onMessage(EMsg.ClientFriendsList, (_header, body) =>
      this.#receiveList(decodeProto('CMsgClientFriendsList', body)),
    );
    cm.onMessage(EMsg.ClientPersonaState, (_header, body) =>
      this.#receivePersonas(decodeProto('CMsgClientPersonaState', body)),
    );
    // all of them right after logon
    cm.onMessage(EMsg.ClientPlayerNicknameList, (_header, body) =>
      this.#receiveNicknames(decodeProto('CMsgClientPlayerNicknameList', body)),
    );
    // set or cleared in another session since
    cm.onMessage(
      'PlayerClient.NotifyFriendNicknameChanged#1',
      (_header, body) => {
        const { accountid, nickname } = decodeProto<{
          accountid: number;
          nickname?: string;
        }>('CPlayer_FriendNicknameChanged_Notification', body);
        this.#receiveNicknames({
          incremental: true,
          nicknames: [{ steamid: steamIdFromAccountId(accountid), nickname }],
        });
      },
    );
  }

  /** How to name the Steam games friends play, Steam sends only their appid. */
  nameGamesWith(lookUp: GameLookUp) {
    this.#lookUpGames = lookUp;
  }

  /** Once logged on: asks for the personas of everyone known or looked up so far, and of `self`. */
  start(self: string) {
    this.#started = true;
    this.#requestPersonas([
      ...new Set([self, ...this.#relationships.keys(), ...this.#requested]),
    ]);
  }

  /** Shows what a `snapshot` had until Steam sends the list. Before `attach`, Steam's list replaces it. */
  restore({ friendIds, users }: FriendsSnapshot) {
    for (const id of friendIds)
      this.#relationships.set(id, RELATIONSHIP_FRIEND);
    // an old status is stale, steam pushes who is online now
    for (const user of users) {
      this.#restored.set(user.steamid, { ...user, online: false });
      if (user.nickname) this.#nicknames.set(user.steamid, user.nickname);
    }
  }

  /** Friends and everyone seen this time, strangers from older snapshots are left out. */
  snapshot(): FriendsSnapshot {
    const friendIds = this.friends.map((friend) => friend.steamid);
    const known = new Set([...friendIds, ...this.#personas.keys()]);
    return {
      friendIds,
      users: [...known].map((steamid) => this.get(steamid)),
    };
  }

  /** Friends, online ones first, then by name. */
  get friends(): Friend[] {
    return [...this.#relationships]
      .filter(([, relationship]) => relationship === RELATIONSHIP_FRIEND)
      .map(([steamid]) => this.get(steamid))
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
      );
  }

  /** Asks Steam for accounts not seen yet (people in a voice chat, say), `changed` follows. */
  lookUp(steamids: string[]) {
    this.#requestPersonas(
      steamids.filter(
        (id) => !this.#personas.has(id) && !this.#requested.has(id),
      ),
    );
  }

  /** What is known about any account, friend or not. The same object while that stays the same. */
  get(steamid: string): Friend {
    const persona = this.#personas.get(steamid);
    const restored = this.#restored.get(steamid);
    const state = persona?.state ?? OFFLINE;
    // going offline may leave the game out
    const game = state === OFFLINE ? null : (persona?.game ?? null);
    const friend: Friend = {
      steamid,
      name: persona?.name ?? restored?.name ?? steamid,
      nickname: this.#nicknames.get(steamid) ?? null,
      avatarUrl: persona?.avatarHash
        ? avatarUrl(persona.avatarHash)
        : (restored?.avatarUrl ?? null),
      online: state !== OFFLINE,
      away: state === AWAY ? 'away' : state === SNOOZE ? 'snooze' : null,
      game: game && {
        appid: game.appid,
        name:
          game.name ??
          (game.appid === null ? null : this.#gameNames.get(game.appid)) ??
          null,
      },
    };
    const shown = this.#shown.get(steamid);
    if (
      shown?.name === friend.name &&
      shown.nickname === friend.nickname &&
      shown.avatarUrl === friend.avatarUrl &&
      shown.online === friend.online &&
      shown.away === friend.away &&
      shown.game?.appid === friend.game?.appid &&
      shown.game?.name === friend.game?.name
    )
      return shown;
    this.#shown.set(steamid, friend);
    return friend;
  }

  #receiveList(message: FriendsListMessage) {
    if (!message.bincremental) this.#relationships.clear();
    const added: string[] = [];
    for (const {
      ulfriendid,
      efriendrelationship = RELATIONSHIP_NONE,
    } of message.friends ?? []) {
      if (efriendrelationship === RELATIONSHIP_NONE) {
        this.#relationships.delete(ulfriendid);
        continue;
      }
      if (!this.#personas.has(ulfriendid)) added.push(ulfriendid);
      this.#relationships.set(ulfriendid, efriendrelationship);
    }
    // before logon the session isn't set up, start() asks for everyone then
    if (this.#started) this.#requestPersonas(added);
    this.emit('changed', {});
  }

  #receiveNicknames({ removal, incremental, nicknames }: NicknameListMessage) {
    if (!incremental && !removal) this.#nicknames.clear();
    for (const { steamid, nickname } of nicknames ?? []) {
      // an empty one is cleared too
      if (nickname && !removal) this.#nicknames.set(steamid, nickname);
      else this.#nicknames.delete(steamid);
    }
    this.emit('changed', {});
  }

  #receivePersonas(message: PersonaStateMessage) {
    const flags = message.status_flags ?? 0;
    // most updates are about what isn't shown (the lobby joined, say)
    let changed = false;
    const unnamed = new Set<number>();
    for (const friend of message.friends ?? []) {
      const before = this.get(friend.friendid);
      const known = this.#personas.get(friend.friendid);
      this.#personas.set(friend.friendid, {
        name: friend.player_name ?? known?.name,
        avatarHash: friend.avatar_hash
          ? hex(friend.avatar_hash)
          : known?.avatarHash,
        // updates without the status flag leave the state out, it didn't change
        state:
          flags & PERSONA_STATUS
            ? (friend.persona_state ?? OFFLINE)
            : (known?.state ?? OFFLINE),
        // name-only updates leave the game out
        game:
          friend.gameid === undefined
            ? (known?.game ?? null)
            : playedGame(friend),
      });
      const after = this.get(friend.friendid);
      const appid = after.game?.appid;
      if (appid && !this.#gameNames.has(appid)) unnamed.add(appid);
      changed ||= after !== before;
    }
    if (unnamed.size > 0) this.#nameGames([...unnamed]);
    if (changed) this.emit('changed', {});
  }

  async #nameGames(appids: number[]) {
    if (!this.#lookUpGames) return;
    for (const appid of appids) this.#gameNames.set(appid, null);
    try {
      for (const { appid, name } of await this.#lookUpGames(appids))
        if (appid !== null) this.#gameNames.set(appid, name);
      this.emit('changed', {});
    } catch {
      // asked again when someone plays one of them next
      for (const appid of appids) this.#gameNames.delete(appid);
    }
  }

  #requestPersonas(steamids: string[]) {
    for (const id of steamids) this.#requested.add(id);
    // until logged on they are only noted, start() asks for them
    if (steamids.length === 0 || !this.#started || !this.#cm) return;
    this.#cm.send(EMsg.ClientRequestFriendData, 'CMsgClientRequestFriendData', {
      persona_state_requested: PERSONA_FLAGS,
      friends: steamids,
    });
  }
}
