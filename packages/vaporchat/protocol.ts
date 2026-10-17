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
  /** while online: Away after a while idle, Snooze after longer */
  away: 'away' | 'snooze' | null;
  /** what they play, null when nothing */
  game: PlayedGame | null;
}

/** What friends see of us, as set with `setStatus`. */
export type MyStatus = 'online' | 'away' | 'invisible';

export interface PlayedGame {
  /** null for non-Steam games */
  appid: number | null;
  /** null until the store names a Steam game, and when it doesn't */
  name: string | null;
}

export interface ChatRoom {
  chatId: string;
  name: string;
  voiceAllowed: boolean;
  membersInVoice: string[];
}

export interface ChatGroup {
  groupId: string;
  /** empty when unnamed, see `groupTitle` */
  name: string;
  avatarUrl: string | null;
  /** SteamID64s */
  memberIds: string[];
  rooms: ChatRoom[];
}

/** Unread messages, as Steam keeps them for all the account's devices. */
export interface Unread {
  /** how many, by the friend's SteamID64 */
  friends: ReadonlyMap<string, number>;
  /** `chatKey`s of rooms with unread messages, Steam doesn't count those */
  rooms: ReadonlySet<string>;
}

/** A text conversation: with a friend, or in a group chat room. */
export type ChatTarget =
  | { kind: 'friend'; steamid: string }
  | { kind: 'room'; groupId: string; chatId: string };

/** A piece of a message, in reading order. Formatting Steam's clients add (links, quotes) is text. */
export type ChatPart =
  | { kind: 'text'; text: string }
  /** a web page, `text` is what to show */
  | { kind: 'link'; text: string; url: string }
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
  /** emoticons and stickers people put on it */
  reactions: Reaction[];
}

export interface IncomingChatMessage {
  chat: ChatTarget;
  message: ChatMessage;
}

/** An emoticon or sticker to put on a message. */
export interface ReactionKey {
  kind: 'emoticon' | 'sticker';
  name: string;
}

/** An emoticon or sticker on a message, with how many put it there. */
export interface Reaction extends ReactionKey {
  url: string;
  count: number;
  /** one of them is us */
  mine: boolean;
}

/** Someone putting a reaction on a message, or taking theirs off. */
export interface ReactionChange {
  chat: ChatTarget;
  /** the message's `id` */
  messageId: string;
  reaction: ReactionKey;
  /** SteamID64 */
  reactor: string;
  added: boolean;
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
  /** when a coming game without a full date is planned for, null with one */
  releaseWindow: ReleaseWindow | null;
  /** not out yet, with or without a date */
  comingSoon: boolean;
  free: boolean;
}

/** A game the user owns, with how much they played it. */
export interface LibraryGame extends StoreItem {
  /** all time, in minutes */
  minutesPlayed: number;
  /** in the last two weeks, in minutes */
  minutesPlayedRecently: number;
  /** null when never played, or played before Steam kept the date */
  lastPlayedAt: number | null;
}

/** A month, quarter or year, by its last day like Steam has it. Milliseconds since the epoch. */
export interface ReleaseWindow {
  at: number;
  precision: 'month' | 'quarter' | 'year';
}

/** The apps the user owns and the ones on their wishlist, by appid, like the store marks them. */
export interface UserApps {
  owned: number[];
  wishlisted: number[];
}

/** Where a game stands with the user, as its store page shows it. */
export interface GameInterest {
  owned: boolean;
  wishlisted: boolean;
  following: boolean;
  /** "not interested", the store stops recommending it */
  ignored: boolean;
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

/** Part of a list, in the list's order. The rest comes by passing `next`, which is null at the end. */
export interface FeedPage<T, Next = number> {
  items: T[];
  next: Next | null;
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

/** A video in the formats Steam has it in, at least one: mp4 is HEVC, webm VP9. */
export type RichVideo = { posterUrl: string | null } & (
  | { mp4: string; webm: string | null }
  | { mp4: null; webm: string }
);

export type RichBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: RichSpan[] }
  | { kind: 'paragraph'; spans: RichSpan[] }
  /** `marker` is `•` or the number, like `2.` */
  | { kind: 'listItem'; depth: number; marker: string; spans: RichSpan[] }
  | { kind: 'quote'; spans: RichSpan[] }
  | { kind: 'code'; text: string }
  | {
      kind: 'image';
      url: string;
      /** pixels, null when the post didn't say */
      width: number | null;
      height: number | null;
      /** an animation's silent looping video to play in its place, like Steam does */
      video: RichVideo | null;
    }
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
  features: GameFeature[];
  screenshots: { url: string; thumbnailUrl: string }[];
  /** `url` is an HLS stream */
  trailers: { url: string; posterUrl: string }[];
  /** `Windows`, `macOS`, `Linux` */
  platforms: string[];
  steamDeck: 'verified' | 'playable' | 'unsupported' | null;
  description: RichBlock[];
  /** each way to buy it, like the store page lists them: the game alone, editions, bundles */
  editions: GameEdition[];
  /** its DLC's appids, in the store's order */
  dlc: number[];
  /** what its developers say about Early Access, null when it isn't in Early Access */
  earlyAccess: { question: string; answer: RichBlock[] }[] | null;
  /** its website first, then its pages elsewhere (Discord, YouTube…) */
  links: { label: string; url: string }[];
  /** per platform it runs on */
  requirements: SystemRequirements[];
}

/** A way to buy a game, its price after any discount. */
export interface GameEdition {
  name: string;
  price: string | null;
  /** only when discounted */
  originalPrice: string | null;
  discountPercent: number;
}

/** What a game needs on one platform. */
export interface SystemRequirements {
  /** `Windows`, `macOS`, `Linux` */
  platform: string;
  minimum: Requirements | null;
  recommended: Requirements | null;
}

/** Labelled rows like `Memory: 8 GB RAM`, older games have their own text instead. */
export interface Requirements {
  rows: { label: string; value: string }[];
  text: RichBlock[];
}

/** What a game supports, like `Single-player` or `Steam Cloud`. */
export interface GameFeature {
  name: string;
  /** steam's white icon, 52x32 */
  iconUrl: string;
}

/** A player's review of a game in the store. */
export interface GameReview {
  id: string;
  author: string;
  avatarUrl: string;
  recommended: boolean;
  /** how long they had played when they wrote it */
  hoursPlayed: number;
  /** milliseconds since the epoch */
  createdAt: number;
  /** how many found it helpful */
  helpful: number;
  body: RichBlock[];
}
