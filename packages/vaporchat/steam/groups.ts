import type { ChatGroup } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import { avatarUrl, hex } from './friends.ts';

/** Steam notifications after which the group list is worth fetching again. */
export const GROUP_CHANGE_NOTIFICATIONS = [
  'ChatRoomClient.NotifyChatRoomGroupRoomsChange#1',
  'ChatRoomClient.NotifyChatGroupUserStateChanged#1',
];

// SteamID64 of individual account 0, account ids are offsets from it
const INDIVIDUAL_STEAMID_BASE = 76561197960265728n;

interface ChatRoomState {
  chat_id: string;
  chat_name?: string;
  voice_allowed?: boolean;
  /** account ids, not SteamID64s */
  members_in_voice?: number[];
}

interface ChatGroupSummary {
  chat_group_id: string;
  chat_group_name?: string;
  chat_group_avatar_sha?: Uint8Array;
  chat_rooms?: ChatRoomState[];
}

function steamIdFromAccountId(accountId: number) {
  return String(INDIVIDUAL_STEAMID_BASE + BigInt(accountId));
}

/** The account's group chats with their rooms and who is in voice. Also subscribes to their changes. */
export async function getGroups(cm: SteamCM): Promise<ChatGroup[]> {
  const { chat_room_groups = [] } = await cm.call<{
    chat_room_groups?: { group_summary: ChatGroupSummary }[];
  }>('ChatRoom.GetMyChatRoomGroups#1', {});
  const summaries = chat_room_groups.map((pair) => pair.group_summary);
  if (summaries.length === 0) return [];
  const groupIds = summaries.map((summary) => summary.chat_group_id);
  // summaries leave out room details like voice permissions, the active group state has them
  const { chat_states = [] } = await cm.call<{
    chat_states?: {
      header_state?: { chat_group_id: string };
      chat_rooms?: ChatRoomState[];
    }[];
  }>('ChatRoom.SetSessionActiveChatRoomGroups#1', {
    chat_group_ids: groupIds,
    chat_groups_data_requested: groupIds,
  });
  return summaries.map((summary) => {
    const state = chat_states.find(
      (s) => s.header_state?.chat_group_id === summary.chat_group_id,
    );
    const rooms = state?.chat_rooms ?? summary.chat_rooms ?? [];
    // groups without a picture have no avatar, unlike users there is no default one
    const avatarSha = summary.chat_group_avatar_sha;
    return {
      groupId: summary.chat_group_id,
      name: summary.chat_group_name ?? '',
      avatarUrl: avatarSha?.some((byte) => byte !== 0)
        ? avatarUrl(hex(avatarSha))
        : null,
      rooms: rooms.map((room) => ({
        chatId: room.chat_id,
        // steam leaves the default room unnamed and shows it as General
        name: room.chat_name || 'General',
        voiceAllowed: room.voice_allowed ?? false,
        membersInVoice: (room.members_in_voice ?? []).map(steamIdFromAccountId),
      })),
    };
  });
}

/** Joins the group an `https://s.team/chat/…` link invites to, returns its id. */
export async function joinGroupByInviteLink(cm: SteamCM, inviteLink: string) {
  const inviteCode = inviteLink.match(
    /^https?:\/\/s\.team\/chat\/([^/]+)$/,
  )?.[1];
  if (!inviteCode) throw new Error('Not a Steam group invite link');
  const info = await cm.call<{ group_summary: { chat_group_id: string } }>(
    'ChatRoom.GetInviteLinkInfo#1',
    { invite_code: inviteCode },
  );
  const groupId = info.group_summary.chat_group_id;
  await cm.call('ChatRoom.JoinChatRoomGroup#1', {
    chat_group_id: groupId,
    invite_code: inviteCode,
  });
  return groupId;
}
