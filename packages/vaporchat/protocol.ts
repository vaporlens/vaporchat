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

/** A game or bundle in the Steam store. Times are milliseconds since the epoch. */
export interface StoreItem {
  /** null for bundles and packages */
  appid: number | null;
  /** the games of a bundle or package, empty for a game */
  includedAppids: number[];
  name: string;
  /** its store page */
  url: string;
  /** the 460x215 header picture */
  imageUrl: string | null;
  /** formatted in the store's currency (`$17.99`), null when free or not for sale */
  price: string | null;
  /** the price before its discount, null without one */
  originalPrice: string | null;
  discountPercent: number;
  discountEndsAt: number | null;
  releasedAt: number | null;
  free: boolean;
}

/** A sale, update or announcement posted on Steam by a game or group. Times are milliseconds. */
export interface SteamEvent {
  id: string;
  title: string;
  /** the game it's about, null for group events */
  appid: number | null;
  /** that game's name, when known */
  game: string | null;
  /** 16:9 capsule */
  imageUrl: string | null;
  /** the start of its text, without formatting */
  summary: string;
  /** the whole post */
  body: RichBlock[];
  url: string;
  startsAt: number;
  endsAt: number | null;
}

/** A part of a sale event's page: a text, a list of games, or both. */
export interface SaleSection {
  title: string;
  body: RichBlock[];
  items: StoreItem[];
}

export type FriendActivityKind =
  | 'friendAdded'
  | 'achievement'
  | 'purchase'
  | 'wishlist'
  | 'review'
  | 'screenshot'
  | 'video'
  | 'workshop'
  | 'favorited'
  | 'firstPlay';

export interface Achievement {
  name: string;
  description: string;
  iconUrl: string | null;
}

/** Something a friend did, like in the activity feed of Steam's client. */
export interface FriendActivity {
  id: string;
  kind: FriendActivityKind;
  /** milliseconds since the epoch */
  time: number;
  /** SteamID64 of the friend */
  actor: string;
  /** SteamID64 of who they became friends with (`friendAdded`) */
  target: string | null;
  game: StoreItem | null;
  /** the ones unlocked (`achievement`) */
  achievements: Achievement[];
  /** where to see it on Steam */
  url: string;
}

/** Part of a feed, newest first. Older entries come with `before: next`, which is null at the end. */
export interface FeedPage<T> {
  items: T[];
  next: number | null;
}

/** Formatted text of a store page or news post, from Steam's BBCode. */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** hidden until tapped */
  spoiler?: boolean;
  link?: string;
}

export type RichBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: RichSpan[] }
  | { kind: 'paragraph'; spans: RichSpan[] }
  /** `marker` is `•` or the number, like `2.` */
  | { kind: 'listItem'; depth: number; marker: string; spans: RichSpan[] }
  | { kind: 'quote'; spans: RichSpan[] }
  | { kind: 'code'; text: string }
  /** pixels, null when the post didn't say */
  | { kind: 'image'; url: string; width: number | null; height: number | null }
  | { kind: 'youtube'; url: string; thumbnailUrl: string }
  /** a link shown on its own, like a store page Steam previews */
  | { kind: 'link'; url: string }
  | { kind: 'rule' };

/** A game's store page. */
export interface GameDetails extends StoreItem {
  shortDescription: string;
  developers: string[];
  publishers: string[];
  /** like `Very Positive`, null without enough reviews */
  reviews: { label: string; percentPositive: number; count: number } | null;
  tags: string[];
  screenshots: { url: string; thumbnailUrl: string }[];
  /** `Windows`, `macOS`, `Linux` */
  platforms: string[];
  steamDeck: 'verified' | 'playable' | 'unsupported' | null;
  description: RichBlock[];
}
