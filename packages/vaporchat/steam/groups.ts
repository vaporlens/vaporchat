import type { ChatAlerts, ChatGroup } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import { avatarUrl, hex, steamIdFromAccountId } from './friends.ts';

/** Steam notifications after which the group list is worth fetching again. */
export const GROUP_CHANGE_NOTIFICATIONS = [
  'ChatRoomClient.NotifyChatRoomGroupRoomsChange#1',
  'ChatRoomClient.NotifyChatGroupUserStateChanged#1',
];

// EChatRoomNotificationLevel: none, mentions of us, of us or everyone, all messages
const ALERT_LEVELS: Record<ChatAlerts, number> = {
  none: 1,
  mentions: 3,
  all: 4,
};

/** Steam's level for a group, unset (0) is the default from Steam's desktop settings, unknown here. */
function alerts(level = 0): ChatAlerts {
  if (level === ALERT_LEVELS.none) return 'none';
  if (level === ALERT_LEVELS.all) return 'all';
  return 'mentions';
}

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
  /** account ids, some of the members */
  top_members?: number[];
}

/** The account's group chats with their rooms and who is in voice. Also subscribes to their changes. */
export async function getGroups(cm: SteamCM): Promise<ChatGroup[]> {
  const { chat_room_groups = [] } = await cm.call<{
    chat_room_groups?: {
      group_summary: ChatGroupSummary;
      user_chat_group_state?: { mobile_notification_level?: number };
    }[];
  }>('ChatRoom.GetMyChatRoomGroups#1', {});
  const summaries = chat_room_groups.map((pair) => pair.group_summary);
  if (summaries.length === 0) return [];
  const groupIds = summaries.map((summary) => summary.chat_group_id);
  // summaries leave out room details like voice permissions, the active group state has them
  const { chat_states = [] } = await cm.call<{
    chat_states?: {
      header_state?: { chat_group_id: string };
      chat_rooms?: ChatRoomState[];
      members?: { accountid: number }[];
    }[];
  }>('ChatRoom.SetSessionActiveChatRoomGroups#1', {
    chat_group_ids: groupIds,
    chat_groups_data_requested: groupIds,
  });
  return chat_room_groups.map(
    ({ group_summary: summary, user_chat_group_state }) => {
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
        // big groups leave out their member list, top members stand in
        memberIds: (
          state?.members?.map((member) => member.accountid) ??
          summary.top_members ??
          []
        ).map(steamIdFromAccountId),
        rooms: rooms.map((room) => ({
          chatId: room.chat_id,
          // steam leaves the default room unnamed and shows it as General
          name: room.chat_name || 'General',
          voiceAllowed: room.voice_allowed ?? false,
          membersInVoice: (room.members_in_voice ?? []).map(
            steamIdFromAccountId,
          ),
        })),
        // rooms can have their own, steam's clients set them per group
        alerts: alerts(user_chat_group_state?.mobile_notification_level),
      };
    },
  );
}

/** Sets which of a group's messages alert us on phones, on all of the account's devices. */
export async function setGroupAlerts(
  cm: SteamCM,
  groupId: string,
  groupAlerts: ChatAlerts,
) {
  await cm.call('ChatRoom.SetUserChatGroupPreferences#1', {
    chat_group_id: groupId,
    chat_group_preferences: {
      mobile_notification_level: ALERT_LEVELS[groupAlerts],
    },
  });
}

/** What to call a group: its name, or like Steam, its other members' names when it has none. */
export function groupTitle(
  group: ChatGroup,
  myId: string,
  nameOf: (steamid: string) => string,
) {
  if (group.name !== '') return group.name;
  return group.memberIds
    .filter((id) => id !== myId)
    .map(nameOf)
    .join(', ');
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
