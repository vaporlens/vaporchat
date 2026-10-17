import type {
  ChatGroup,
  ChatMessage,
  ChatTarget,
  Friend,
  IncomingChatMessage,
  MyStatus,
  OwnedEmoticons,
  ReactionChange,
  ReactionKey,
  SteamClientNotifications,
  SteamMethods,
  SteamServerNotifications,
  StickerPart,
} from '../protocol.ts';
import {
  type CacheStore,
  loadCached,
  saveCached,
} from '../steam/cacheStore.ts';
import { EMsg, type SteamCM } from '../steam/cm.ts';
import { getEmoticons } from '../steam/emoticons.ts';
import { EResult, hasEResult } from '../steam/eresult.ts';
import { FriendsList, type FriendsSnapshot } from '../steam/friends.ts';
import {
  GROUP_CHANGE_NOTIFICATIONS,
  getGroups,
  joinGroupByInviteLink,
} from '../steam/groups.ts';
import { type ChatImage, sendImage } from '../steam/imageUpload.ts';
import { steamLanguage } from '../steam/language.ts';
import {
  type LogOnOptions,
  logOnSteam,
  steamIdFromRefreshToken,
  type TokenStore,
  type WebSession,
  webSession,
} from '../steam/logOn.ts';
import {
  getRecentMessages,
  onChatMessages,
  onReactions,
  onTyping,
  react,
  sendMessage,
  sendTyping,
} from '../steam/messages.ts';
import { decodeProto } from '../steam/protos.ts';
import { UnreadChats } from '../steam/unread.ts';
import { Emitter } from './emitter.ts';
import { SteamFeeds } from './feeds.ts';

const CLIENT_NOTIFICATIONS: Record<keyof SteamClientNotifications, string> = {
  'VoiceChat.NotifyUserVoiceStatus#1':
    'CVoiceChat_UserVoiceStatus_Notification',
};

const SERVER_NOTIFICATIONS: Record<keyof SteamServerNotifications, string> = {
  'WebRTCClientNotifications.NotifyWebRTCSessionConnected#1':
    'CWebRTC_WebRTCSessionConnected_Notification',
  'WebRTCClientNotifications.NotifyWebRTCUpdateRemoteDescription#1':
    'CWebRTC_WebRTCUpdateRemoteDescription_Notification',
  'VoiceChatClient.NotifyOneOnOneChatRequested#1':
    'CVoiceChat_OneOnOneChatRequested_Notification',
  'VoiceChatClient.NotifyOneOnOneChatResponse#1':
    'CVoiceChat_OneOnOneChatRequestResponse_Notification',
  'VoiceChatClient.NotifyUserJoinedVoiceChat#1':
    'CVoiceChat_UserJoinedVoiceChat_Notification',
  'VoiceChatClient.NotifyUserLeftVoiceChat#1':
    'CVoiceChat_UserLeftVoiceChat_Notification',
  'VoiceChatClient.NotifyUserVoiceStatus#1':
    'CVoiceChat_UserVoiceStatus_Notification',
  'VoiceChatClient.NotifyAllUsersVoiceStatus#1':
    'CVoiceChat_AllMembersStatus_Notification',
  'VoiceChatClient.NotifyVoiceChatEnded#1':
    'CVoiceChat_VoiceChatEnded_Notification',
  'ChatRoomClient.NotifyShouldRejoinChatRoomVoiceChat#1':
    'CChatRoom_NotifyShouldRejoinChatRoomVoiceChat_Notification',
};

// EPersonaState
const PERSONA_STATES: Record<MyStatus, number> = {
  online: 1,
  away: 3,
  invisible: 7,
};
// web access tokens last a day, a fresh one is made well before that
const WEB_SESSION_MS = 60 * 60 * 1000;
const FAIL = new Set<number>([EResult.Fail]);
// friends' updates come in bursts, the cached list is saved once they settle
const SAVE_FRIENDS_DELAY_MS = 5000;
// and told about once per burst, steam sends each friend's status as its own message
const FRIENDS_CHANGED_DELAY_MS = 100;

// steam answers these with Fail even though they took effect, the official client ignores it too
function failIsExpected<M extends keyof SteamMethods>(
  method: M,
  body: SteamMethods[M]['request'],
) {
  if (method === 'WebRTCClient.AcknowledgeUpdatedRemoteDescription#1') {
    return true;
  }
  return (
    method === 'VoiceChat.AnswerOneOnOneChat#1' &&
    !(body as SteamMethods['VoiceChat.AnswerOneOnOneChat#1']['request'])
      .accepted_request
  );
}

type ConnectionEvents = SteamServerNotifications & {
  friendsChanged: Friend[];
  groupsChanged: Record<string, never>;
  /** a text message in any chat, ours from other devices included */
  message: IncomingChatMessage;
  /** a friend typing to us, again every few seconds while they do */
  typing: { steamid: string };
  /** a reaction put on or taken off a message in any chat, ours from other devices included */
  reaction: ReactionChange;
  close: { reason: string };
};

export interface VoiceLogOnOptions extends LogOnOptions {
  /** the user's BCP 47 locale (`de-DE`), sale events are in its language where they have it */
  locale?: string;
  /** what friends see of us, online by default */
  status?: MyStatus;
}

function friendsCacheKey(steamid: string) {
  return `friends-${steamid}`;
}

/**
 * A Steam connection: voice signaling, text chat, friends and group chats. Usable while it logs
 * on, requests wait for the logon then.
 */
export class VoiceConnection extends Emitter<ConnectionEvents> {
  /** logged on */
  #cm: Promise<SteamCM>;
  #steamid: string;
  #friends: FriendsList;
  /** the refresh token, web sessions for image uploads and news are made from it */
  #store: TokenStore;
  #cache: CacheStore | undefined;
  #saveFriendsTimer: ReturnType<typeof setTimeout> | null = null;
  #friendsChangedTimer: ReturnType<typeof setTimeout> | null = null;
  /** what was last saved, status updates often leave the list as it was */
  #savedFriends = '';
  #emoticons: Promise<OwnedEmoticons> | null = null;
  #web: { session: Promise<WebSession>; since: number } | null = null;
  #status: MyStatus;
  /** Steam's store and client feeds: deals, releases, game pages, news, friends' activity. */
  readonly feeds: SteamFeeds;
  /** Unread messages per chat, shared with the account's other devices. Counted once logged on. */
  readonly unread = new UnreadChats();
  /** Settles with the logon, rejecting when it failed. Lost connections after it come as `close`. */
  readonly ready: Promise<void>;

  private constructor(
    cm: Promise<SteamCM>,
    steamid: string,
    friends: FriendsList,
    store: TokenStore,
    cache: CacheStore | undefined,
    /** steam's language id, for sale events */
    language: number,
    status: MyStatus,
  ) {
    super();
    this.#status = status;
    this.#cm = cm;
    this.#steamid = steamid;
    this.#friends = friends;
    this.#store = store;
    this.#cache = cache;
    this.feeds = new SteamFeeds(language, {
      cm,
      webSession: () => this.#webSession(),
    });
    friends.nameGamesWith((appids) => this.feeds.getStoreItems(appids));
    friends.on('changed', () => {
      this.#friendsChangedSoon();
      this.#saveFriendsSoon();
    });
    this.ready = cm.then((logged) => this.#listen(logged));
    // the logon's error also comes from every request, an ignored `ready` is no unhandled rejection
    this.ready.catch(() => {});
  }

  #listen(cm: SteamCM) {
    for (const [name, typeName] of Object.entries(SERVER_NOTIFICATIONS)) {
      cm.onMessage(name, (_header, body) =>
        this.emit(
          name as keyof SteamServerNotifications,
          decodeProto(typeName, body),
        ),
      );
    }
    for (const name of GROUP_CHANGE_NOTIFICATIONS) {
      cm.onMessage(name, () => this.emit('groupsChanged', {}));
    }
    onChatMessages(cm, (incoming) => this.emit('message', incoming));
    onTyping(cm, (steamid) => this.emit('typing', { steamid }));
    onReactions(cm, (change) => this.emit('reaction', change));
    cm.on('close', (event) => this.emit('close', event));
    this.#sendStatus(cm);
    this.#friends.start(cm.steamid);
    // without it, messages from now on are still counted
    this.unread.start(cm).catch(() => {});
  }

  #sendStatus(cm: SteamCM) {
    cm.send(EMsg.ClientChangeStatus, 'CMsgClientChangeStatus', {
      persona_state: PERSONA_STATES[this.#status],
    });
  }

  /**
   * Logs on with the stored refresh token (or `options.credentials`) and goes online (or
   * `options.status`), like the official client does.
   */
  static async logOn(store: TokenStore, options?: VoiceLogOnOptions) {
    const connection = await VoiceConnection.start(store, options);
    await connection.ready;
    return connection;
  }

  /**
   * Like `logOn`, but returns as soon as the account is known, which with a stored token is
   * before Steam answers. Friends are the cached ones until Steam sends them, see `ready`.
   */
  static async start(
    store: TokenStore,
    {
      locale = 'en',
      cache,
      status = 'online',
      ...options
    }: VoiceLogOnOptions = {},
  ) {
    // with credentials, steam may log on someone else than the stored token's account
    const stored = options.credentials ? null : await store.load();
    const known = stored ? steamIdFromRefreshToken(stored) : null;
    const friends = new FriendsList();
    // before logging on, steam's list replaces the cached one
    const snapshot =
      known && cache
        ? await loadCached<FriendsSnapshot>(cache, friendsCacheKey(known))
        : null;
    if (snapshot) friends.restore(snapshot);
    const cm = logOnSteam(store, {
      ...options,
      cache,
      // a rejected stored token means a second connection
      beforeLogOn: (connecting) => friends.attach(connecting),
    });
    return new VoiceConnection(
      cm,
      known ?? (await cm).steamid,
      friends,
      store,
      cache,
      steamLanguage(locale),
      status,
    );
  }

  get me() {
    return this.#friends.get(this.#steamid);
  }

  /** What friends see of us. Steam keeps one status for the account's sessions. */
  get status() {
    return this.#status;
  }

  /** Shows us online, away or invisible to friends from now on, `status` on `logOn` keeps it. */
  setStatus(status: MyStatus) {
    this.#status = status;
    // a closed connection has no one to tell
    this.#cm.then((cm) => this.#sendStatus(cm)).catch(() => {});
  }

  /** Any account by SteamID64. Unknown ones are looked up, `friendsChanged` follows. */
  user(steamid: string) {
    this.#friends.lookUp([steamid]);
    return this.#friends.get(steamid);
  }

  /** Friends, online ones first. Updates come as `friendsChanged`. */
  get friends() {
    return this.#friends.friends;
  }

  async call<M extends keyof SteamMethods>(
    method: M,
    body: SteamMethods[M]['request'],
  ): Promise<SteamMethods[M]['response']> {
    try {
      return await (await this.#cm).call(method, body);
    } catch (err) {
      if (hasEResult(err, FAIL) && failIsExpected(method, body)) {
        return {} as SteamMethods[M]['response'];
      }
      throw err;
    }
  }

  /** Dropped when the logon fails. */
  notify<N extends keyof SteamClientNotifications>(
    name: N,
    body: SteamClientNotifications[N],
  ) {
    this.#cm.then(
      (cm) => cm.notify(name, CLIENT_NOTIFICATIONS[name], body),
      () => {},
    );
  }

  /** Group chats with their rooms. Updates come as `groupsChanged`, fetch again then. */
  async getGroups(): Promise<ChatGroup[]> {
    return getGroups(await this.#cm);
  }

  async joinGroupByInviteLink(inviteLink: string) {
    return joinGroupByInviteLink(await this.#cm, inviteLink);
  }

  /**
   * Sends text (`:name:` of owned emoticons becomes the emoticon) or a sticker, returns the
   * message as Steam stored it. Its echo may also come as `message`.
   */
  async sendMessage(chat: ChatTarget, content: string | StickerPart) {
    return sendMessage(await this.#cm, chat, content);
  }

  /**
   * Puts a reaction on a message (`added`) or takes ours off. Show it with `applyReaction`
   * once done, Steam may also send it back as `reaction`.
   */
  async react(
    chat: ChatTarget,
    message: Pick<ChatMessage, 'time'>,
    reaction: ReactionKey,
    added: boolean,
  ) {
    await react(await this.#cm, chat, message, reaction, added);
  }

  /** Tells a friend we're typing to them. Send again every few seconds while typing. */
  async sendTyping(steamid: string) {
    await sendTyping(await this.#cm, steamid);
  }

  /**
   * Uploads an image and has Steam post it into the chat. It arrives as `message`. Goes through
   * steamcommunity.com, which browsers can't reach without a proxy (no CORS).
   */
  async sendImage(chat: ChatTarget, image: ChatImage) {
    await sendImage(await this.#webSession(), chat, image);
  }

  /** A steamcommunity.com and store login, made once an hour rather than per request. */
  #webSession() {
    if (!this.#web || Date.now() - this.#web.since > WEB_SESSION_MS) {
      const session = this.#store.load().then(async (refreshToken) => {
        if (!refreshToken) throw new Error('Signed out');
        return webSession(await this.#cm, refreshToken);
      });
      // a failed one is made again next time
      session.catch(() => {
        if (this.#web?.session === session) this.#web = null;
      });
      this.#web = { session, since: Date.now() };
    }
    return this.#web.session;
  }

  /** The emoticons and stickers the account can send, recently used first. Fetched once. */
  getEmoticons() {
    this.#emoticons ??= this.#cm.then(getEmoticons).catch((err: Error) => {
      // asked again next time
      this.#emoticons = null;
      throw err;
    });
    return this.#emoticons;
  }

  /**
   * The latest messages of a chat, oldest first. Older ones come with `before: next` of the
   * page before. New ones come as `message`.
   */
  async getRecentMessages(chat: ChatTarget, before: number | null = null) {
    return getRecentMessages(await this.#cm, chat, before);
  }

  #friendsChangedSoon() {
    if (this.#friendsChangedTimer) return;
    this.#friendsChangedTimer = setTimeout(() => {
      this.#friendsChangedTimer = null;
      this.emit('friendsChanged', this.#friends.friends);
    }, FRIENDS_CHANGED_DELAY_MS);
  }

  #saveFriendsSoon() {
    const cache = this.#cache;
    if (!cache || this.#saveFriendsTimer) return;
    this.#saveFriendsTimer = setTimeout(() => {
      this.#saveFriendsTimer = null;
      const snapshot = this.#friends.snapshot();
      const json = JSON.stringify(snapshot);
      if (json === this.#savedFriends) return;
      this.#savedFriends = json;
      saveCached(cache, friendsCacheKey(this.#steamid), snapshot);
    }, SAVE_FRIENDS_DELAY_MS);
  }

  /** A logon still going on is closed once done. Unsaved friends' changes are dropped. */
  close() {
    if (this.#saveFriendsTimer) clearTimeout(this.#saveFriendsTimer);
    if (this.#friendsChangedTimer) clearTimeout(this.#friendsChangedTimer);
    this.#cm.then(
      (cm) => cm.close(),
      () => {},
    );
  }
}
