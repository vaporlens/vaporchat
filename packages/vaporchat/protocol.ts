// Contract between the server (owns the Steam connection) and the browser (owns WebRTC media).
// Steam message fields keep their protobuf snake_case names, 64-bit ids are decimal strings.

export interface WebRTCSessionConnected {
  ssrc: number;
  client_ip: number;
  client_port: number;
  server_ip: number;
  server_port: number;
}

export interface WebRTCUpdateRemoteDescription {
  remote_description: string;
  remote_description_version: string;
  ssrcs_to_accountids?: { ssrc: number; accountid: number }[];
}

export interface UserVoiceStatus {
  voice_chatid: string;
  user_steamid: string;
  user_muted_mic_locally?: boolean;
  user_muted_output_locally?: boolean;
  user_has_no_mic_for_session?: boolean;
  user_webaudio_sample_rate?: number;
  user_sends_video?: boolean;
}

interface VoiceChatMembership {
  voice_chatid: string;
  user_steamid: string;
  chatid?: string;
  chat_group_id?: string;
  one_on_one_steamid_lower?: string;
  one_on_one_steamid_higher?: string;
}

export interface VoiceChatEnded {
  voice_chatid: string;
  chatid?: string;
  chat_group_id?: string;
  one_on_one_steamid_lower?: string;
  one_on_one_steamid_higher?: string;
}

/** Steam service methods the browser may call through the server. */
export interface SteamMethods {
  'WebRTCClient.InitiateWebRTCConnection#1': {
    request: { sdp: string; browser_name: string; browser_version: string };
    response: { remote_description: string };
  };
  'WebRTCClient.AcknowledgeUpdatedRemoteDescription#1': {
    request: {
      ip_webrtc_server: number;
      port_webrtc_server: number;
      ip_webrtc_session_client: number;
      port_webrtc_session_client: number;
      remote_description_version: string;
    };
    response: Record<string, never>;
  };
  'ChatRoom.JoinVoiceChat#1': {
    request: { chat_group_id: string; chat_id: string };
    response: { voice_chatid: string };
  };
  'ChatRoom.LeaveVoiceChat#1': {
    request: { chat_group_id: string; chat_id: string };
    response: Record<string, never>;
  };
  'VoiceChat.RequestOneOnOneChat#1': {
    request: { steamid_partner: string };
    response: { voice_chatid: string };
  };
  'VoiceChat.AnswerOneOnOneChat#1': {
    request: {
      voice_chatid: string;
      steamid_partner: string;
      accepted_request: boolean;
    };
    response: Record<string, never>;
  };
  'VoiceChat.EndOneOnOneChat#1': {
    request: { steamid_partner: string };
    response: Record<string, never>;
  };
  'VoiceChat.UpdateVoiceChatWebRTCData#1': {
    request: {
      voice_chatid: string;
      ip_webrtc_server: number;
      port_webrtc_server: number;
      ip_webrtc_client: number;
      port_webrtc_client: number;
      ssrc_my_sending_stream: number;
      user_agent: string;
      has_audio_worklets_support: boolean;
      has_webrtc_data_channel: boolean;
      accepts_webrtc_video: boolean;
      sends_webrtc_video: boolean;
    };
    response: { send_client_voice_logs?: boolean };
  };
}

/** One-way Steam notifications the browser may send through the server. */
export interface SteamClientNotifications {
  'VoiceChat.NotifyUserVoiceStatus#1': UserVoiceStatus;
}

/** Steam notifications the server forwards to the browser. */
export interface SteamServerNotifications {
  'WebRTCClientNotifications.NotifyWebRTCSessionConnected#1': WebRTCSessionConnected;
  'WebRTCClientNotifications.NotifyWebRTCUpdateRemoteDescription#1': WebRTCUpdateRemoteDescription;
  'VoiceChatClient.NotifyOneOnOneChatRequested#1': {
    voice_chatid: string;
    steamid_partner: string;
  };
  'VoiceChatClient.NotifyOneOnOneChatResponse#1': {
    voicechat_id: string;
    steamid_partner: string;
    accepted_request?: boolean;
  };
  'VoiceChatClient.NotifyUserJoinedVoiceChat#1': VoiceChatMembership;
  'VoiceChatClient.NotifyUserLeftVoiceChat#1': VoiceChatMembership;
  'VoiceChatClient.NotifyUserVoiceStatus#1': UserVoiceStatus;
  'VoiceChatClient.NotifyAllUsersVoiceStatus#1': {
    voice_chatid: string;
    users?: UserVoiceStatus[];
  };
  'VoiceChatClient.NotifyVoiceChatEnded#1': VoiceChatEnded;
  'ChatRoomClient.NotifyShouldRejoinChatRoomVoiceChat#1': {
    chat_id: string;
    chat_group_id: string;
  };
}

export interface Friend {
  steamid: string;
  name: string;
  avatarUrl: string | null;
  online: boolean;
}

export interface ChatRoom {
  chatId: string;
  name: string;
  voiceAllowed: boolean;
  membersInVoice: string[];
}

export interface ChatGroup {
  groupId: string;
  name: string;
  rooms: ChatRoom[];
}

/** Account-level queries answered by the server from steam-user state. */
export interface AppMethods {
  getMe: { request: Record<string, never>; response: Friend };
  getFriends: { request: Record<string, never>; response: Friend[] };
  getGroups: { request: Record<string, never>; response: ChatGroup[] };
  joinGroupByInviteLink: {
    request: { inviteLink: string };
    response: { groupId: string };
  };
}

export interface AppNotifications {
  groupsChanged: Record<string, never>;
}

export type Methods = SteamMethods & AppMethods;
export type MethodName = keyof Methods;
export type ServerNotifications = SteamServerNotifications & AppNotifications;
export type ServerNotificationName = keyof ServerNotifications;
export type ClientNotificationName = keyof SteamClientNotifications;

/** browser → server */
export type ClientMessage =
  | {
      [M in MethodName]: {
        kind: 'call';
        id: number;
        method: M;
        body: Methods[M]['request'];
      };
    }[MethodName]
  | {
      [N in ClientNotificationName]: {
        kind: 'notify';
        name: N;
        body: SteamClientNotifications[N];
      };
    }[ClientNotificationName];

/** server → browser */
export type ServerMessage =
  | { kind: 'result'; id: number; body: unknown }
  | { kind: 'error'; id: number; message: string; eresult?: number }
  | {
      [N in ServerNotificationName]: {
        kind: 'notification';
        name: N;
        body: ServerNotifications[N];
      };
    }[ServerNotificationName];
