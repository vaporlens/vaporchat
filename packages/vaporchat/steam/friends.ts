import { Emitter } from '../client/emitter.ts';
import type { Friend } from '../protocol.ts';
import { EMsg, type SteamCM } from './cm.ts';
import { decodeProto } from './protos.ts';

// EFriendRelationship.Friend, the rest are pending/blocked/ignored
const RELATIONSHIP_FRIEND = 3;
const RELATIONSHIP_NONE = 0;
// EClientPersonaStateFlag: Status | PlayerName | Presence (avatar)
const PERSONA_STATUS = 1;
const PERSONA_FLAGS = PERSONA_STATUS | 2 | 16;
// EPersonaState.Offline
const OFFLINE = 0;
// steam sends all zeros for accounts that never set an avatar, this is its default picture
const DEFAULT_AVATAR_HASH = 'fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb';

interface FriendsListMessage {
  bincremental?: boolean;
  friends?: { ulfriendid: string; efriendrelationship?: number }[];
}

interface PersonaStateMessage {
  status_flags?: number;
  friends?: {
    friendid: string;
    persona_state?: number;
    player_name?: string;
    avatar_hash?: Uint8Array;
  }[];
}

interface Persona {
  name?: string;
  avatarHash?: string;
  state: number;
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
  #cm: SteamCM;
  #relationships = new Map<string, number>();
  #personas = new Map<string, Persona>();
  #requested = new Set<string>();
  #started = false;

  constructor(cm: SteamCM) {
    super();
    this.#cm = cm;
    cm.onMessage(EMsg.ClientFriendsList, (_header, body) =>
      this.#receiveList(decodeProto('CMsgClientFriendsList', body)),
    );
    cm.onMessage(EMsg.ClientPersonaState, (_header, body) =>
      this.#receivePersonas(decodeProto('CMsgClientPersonaState', body)),
    );
  }

  /** Once logged on: asks for the personas of everyone known so far, and of `self`. */
  start(self: string) {
    this.#started = true;
    this.#requestPersonas([self, ...this.#relationships.keys()]);
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

  /** What is known about any account, friend or not. */
  get(steamid: string): Friend {
    const persona = this.#personas.get(steamid);
    return {
      steamid,
      name: persona?.name ?? steamid,
      avatarUrl: persona?.avatarHash ? avatarUrl(persona.avatarHash) : null,
      online: (persona?.state ?? OFFLINE) !== OFFLINE,
    };
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

  #receivePersonas(message: PersonaStateMessage) {
    const flags = message.status_flags ?? 0;
    for (const friend of message.friends ?? []) {
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
      });
    }
    this.emit('changed', {});
  }

  #requestPersonas(steamids: string[]) {
    if (steamids.length === 0) return;
    for (const id of steamids) this.#requested.add(id);
    this.#cm.send(EMsg.ClientRequestFriendData, 'CMsgClientRequestFriendData', {
      persona_state_requested: PERSONA_FLAGS,
      friends: steamids,
    });
  }
}
