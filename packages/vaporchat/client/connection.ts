import type {
  ChatGroup,
  Friend,
  SteamClientNotifications,
  SteamMethods,
  SteamServerNotifications,
} from '../protocol.ts';
import { EMsg, type SteamCM } from '../steam/cm.ts';
import { EResult, hasEResult } from '../steam/eresult.ts';
import { FriendsList } from '../steam/friends.ts';
import {
  GROUP_CHANGE_NOTIFICATIONS,
  getGroups,
  joinGroupByInviteLink,
} from '../steam/groups.ts';
import {
  type LogOnOptions,
  logOnSteam,
  type TokenStore,
} from '../steam/logOn.ts';
import { decodeProto } from '../steam/protos.ts';
import { Emitter } from './emitter.ts';

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

// EPersonaState.Online
const ONLINE = 1;
const FAIL = new Set<number>([EResult.Fail]);

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
  close: { reason: string };
};

/** A logged-on Steam connection: voice signaling, friends and group chats. */
export class VoiceConnection extends Emitter<ConnectionEvents> {
  #cm: SteamCM;
  #friends: FriendsList;

  private constructor(cm: SteamCM, friends: FriendsList) {
    super();
    this.#cm = cm;
    this.#friends = friends;
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
    friends.on('changed', () => this.emit('friendsChanged', friends.friends));
    cm.on('close', (event) => this.emit('close', event));
  }

  /**
   * Logs on with the stored refresh token (or `options.credentials`) and goes online,
   * like the official client does.
   */
  static async logOn(store: TokenStore, options: LogOnOptions = {}) {
    const lists = new Map<SteamCM, FriendsList>();
    const cm = await logOnSteam(store, {
      ...options,
      // a rejected stored token means a second connection, keep the list of each
      beforeLogOn: (connecting) =>
        lists.set(connecting, new FriendsList(connecting)),
    });
    const friends = lists.get(cm);
    if (!friends) throw new Error('Steam connection has no friends list');
    const connection = new VoiceConnection(cm, friends);
    cm.send(EMsg.ClientChangeStatus, 'CMsgClientChangeStatus', {
      persona_state: ONLINE,
    });
    friends.start(cm.steamid);
    return connection;
  }

  get me() {
    return this.#friends.get(this.#cm.steamid);
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
      return await this.#cm.call(method, body);
    } catch (err) {
      if (hasEResult(err, FAIL) && failIsExpected(method, body)) {
        return {} as SteamMethods[M]['response'];
      }
      throw err;
    }
  }

  notify<N extends keyof SteamClientNotifications>(
    name: N,
    body: SteamClientNotifications[N],
  ) {
    this.#cm.notify(name, CLIENT_NOTIFICATIONS[name], body);
  }

  /** Group chats with their rooms. Updates come as `groupsChanged`, fetch again then. */
  getGroups(): Promise<ChatGroup[]> {
    return getGroups(this.#cm);
  }

  joinGroupByInviteLink(inviteLink: string) {
    return joinGroupByInviteLink(this.#cm, inviteLink);
  }

  close() {
    this.#cm.close();
  }
}
