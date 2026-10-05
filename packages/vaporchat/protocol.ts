// Shapes of the Steam voice messages the client sends and receives, and of the account data it shows.
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

/** Steam service methods the voice client calls. */
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

/** One-way Steam notifications the voice client sends. */
export interface SteamClientNotifications {
  'VoiceChat.NotifyUserVoiceStatus#1': UserVoiceStatus;
}

/** Steam notifications the voice client listens to. */
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
  avatarUrl: string | null;
  rooms: ChatRoom[];
}

/** A text conversation: with a friend, or in a group chat room. */
export type ChatTarget =
  | { kind: 'friend'; steamid: string }
  | { kind: 'room'; groupId: string; chatId: string };

/** A piece of a message, in reading order. Formatting Steam's clients add (links, quotes) is text. */
export type ChatPart =
  | { kind: 'text'; text: string }
  | { kind: 'emoticon'; name: string; url: string }
  /** big and often animated (APNG) */
  | { kind: 'sticker'; name: string; url: string }
  | {
      kind: 'image';
      url: string;
      thumbnailUrl: string;
      /** pixels, null when Steam didn't say */
      width: number | null;
      height: number | null;
    };

export type EmoticonPart = Extract<ChatPart, { kind: 'emoticon' }>;
export type StickerPart = Extract<ChatPart, { kind: 'sticker' }>;

/** The emoticons and stickers the account can send, recently used ones first. */
export interface OwnedEmoticons {
  emoticons: EmoticonPart[];
  stickers: StickerPart[];
}

export interface ChatMessage {
  /** unique within its chat, the same for our own message and its echo */
  id: string;
  /** SteamID64 of who wrote it */
  sender: string;
  parts: ChatPart[];
  /** milliseconds since the epoch, the ordinal of messages in the same second as milliseconds */
  time: number;
}

export interface IncomingChatMessage {
  chat: ChatTarget;
  message: ChatMessage;
}
