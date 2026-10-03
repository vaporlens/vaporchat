import SteamUser from 'steam-user';
import type {
  ClientMessage,
  ServerMessage,
  SteamClientNotifications,
  SteamMethods,
  SteamServerNotifications,
  VoiceChatEnded,
} from '../protocol.ts';
import {
  callService,
  notifyService,
  onServiceNotification,
  SteamServiceError,
} from '../steam/serviceCalls.ts';
import {
  getFriends,
  getGroups,
  getMe,
  joinGroupByInviteLink,
} from './account.ts';
import { ActiveVoiceChats, type SteamCall } from './activeVoiceChats.ts';

// only voice signaling goes through, the browser can't call arbitrary methods on the account
const STEAM_METHODS: Record<keyof SteamMethods, true> = {
  'WebRTCClient.InitiateWebRTCConnection#1': true,
  'WebRTCClient.AcknowledgeUpdatedRemoteDescription#1': true,
  'ChatRoom.JoinVoiceChat#1': true,
  'ChatRoom.LeaveVoiceChat#1': true,
  'VoiceChat.RequestOneOnOneChat#1': true,
  'VoiceChat.AnswerOneOnOneChat#1': true,
  'VoiceChat.EndOneOnOneChat#1': true,
  'VoiceChat.UpdateVoiceChatWebRTCData#1': true,
};

/** `ChatRoom.JoinVoiceChat#1` → `CChatRoom_JoinVoiceChat_Request` */
function protoName(method: string, kind: 'Request' | 'Response') {
  const [service, name] = method.replace(/#\d+$/, '').split('.');
  return `C${service}_${name}_${kind}`;
}

type SteamMethodCall = Extract<
  ClientMessage,
  { kind: 'call'; method: keyof SteamMethods }
>;

// steam answers these with Fail even though they took effect, the official client ignores it too
function failIsExpected(call: SteamMethodCall) {
  if (call.method === 'WebRTCClient.AcknowledgeUpdatedRemoteDescription#1') {
    return true;
  }
  return (
    call.method === 'VoiceChat.AnswerOneOnOneChat#1' &&
    !call.body.accepted_request
  );
}

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

function isSteamMethod(method: string): method is keyof SteamMethods {
  return method in STEAM_METHODS;
}

function runMethod(
  client: SteamUser,
  message: ClientMessage & { kind: 'call' },
) {
  switch (message.method) {
    case 'getMe':
      return getMe(client);
    case 'getFriends':
      return getFriends(client);
    case 'getGroups':
      return getGroups(client);
    case 'joinGroupByInviteLink':
      return joinGroupByInviteLink(client, message.body.inviteLink);
  }
  if (!isSteamMethod(message.method)) {
    throw new Error(`Unknown method ${message.method}`);
  }
  const call = message as SteamMethodCall;
  return callSteam(client, call.method, call.body).catch((err: Error) => {
    if (
      err instanceof SteamServiceError &&
      err.eresult === SteamUser.EResult.Fail &&
      failIsExpected(call)
    ) {
      return {};
    }
    throw err;
  });
}

function callSteam<M extends keyof SteamMethods>(
  client: SteamUser,
  method: M,
  body: SteamMethods[M]['request'],
) {
  return callService<SteamMethods[M]['response']>(
    client,
    method,
    protoName(method, 'Request'),
    protoName(method, 'Response'),
    body,
  );
}

/**
 * Bridges one browser connection to the account's Steam session: forwards whitelisted
 * voice signaling calls and pushes voice notifications back. Transport agnostic.
 * `close()` leaves every voice chat the connection is still in.
 */
export function createVoiceProxy(
  client: SteamUser,
  send: (message: ServerMessage) => void,
) {
  const unsubscribers = Object.entries(SERVER_NOTIFICATIONS).map(
    ([name, typeName]) =>
      onServiceNotification(client, name, typeName, (body) =>
        send({ kind: 'notification', name, body } as ServerMessage),
      ),
  );
  const active = new ActiveVoiceChats();
  unsubscribers.push(
    onServiceNotification(
      client,
      'VoiceChatClient.NotifyVoiceChatEnded#1',
      SERVER_NOTIFICATIONS['VoiceChatClient.NotifyVoiceChatEnded#1'],
      (body) => active.ended(body as VoiceChatEnded),
    ),
  );
  const onGroupsChanged = () =>
    send({ kind: 'notification', name: 'groupsChanged', body: {} });
  client.chat.on('chatRoomGroupRoomsChange', onGroupsChanged);
  client.chat.on('chatRoomGroupSelfStateChange', onGroupsChanged);

  async function handle(message: ClientMessage) {
    if (message.kind === 'notify') {
      // notifications have no reply channel, so failures can only be logged
      try {
        notifyService(
          client,
          message.name,
          CLIENT_NOTIFICATIONS[message.name],
          message.body,
        );
      } catch (err) {
        console.error(`Voice proxy ${message.name} failed:`, err);
      }
      return;
    }
    try {
      const body = await runMethod(client, message);
      if (isSteamMethod(message.method)) {
        active.record({
          method: message.method,
          request: message.body,
          response: body,
        } as SteamCall);
      }
      send({ kind: 'result', id: message.id, body });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`Voice proxy ${message.method} failed:`, error.message);
      send({
        kind: 'error',
        id: message.id,
        message: error.message,
        eresult: error instanceof SteamServiceError ? error.eresult : undefined,
      });
    }
  }

  async function close() {
    for (const unsubscribe of unsubscribers) unsubscribe();
    client.chat.off('chatRoomGroupRoomsChange', onGroupsChanged);
    client.chat.off('chatRoomGroupSelfStateChange', onGroupsChanged);
    // the browser carried the media, so whatever it was in is dead now
    const leaving = [
      ...active
        .groups()
        .map((room) => callSteam(client, 'ChatRoom.LeaveVoiceChat#1', room)),
      ...active.callPartners().map((partner) =>
        callSteam(client, 'VoiceChat.EndOneOnOneChat#1', {
          steamid_partner: partner,
        }),
      ),
    ];
    if (leaving.length === 0) return;
    console.log(
      `Voice client disconnected, leaving ${leaving.length} voice chat(s) it was in`,
    );
    for (const result of await Promise.allSettled(leaving)) {
      if (result.status === 'rejected') {
        console.error(
          'Leaving voice chat for disconnected client failed:',
          result.reason,
        );
      }
    }
  }

  return { handle, close };
}
