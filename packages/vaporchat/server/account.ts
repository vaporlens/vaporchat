import SteamUser from 'steam-user';
import type SteamChatRoomClient from 'steam-user/components/chatroom.js';
import type { AppMethods, ChatGroup, Friend } from '../protocol.ts';

function toFriend(client: SteamUser, steamid: string): Friend {
  const persona = client.users[steamid];
  return {
    steamid,
    name: persona?.player_name ?? steamid,
    avatarUrl: persona?.avatar_url_full ?? null,
    // steam-user leaves the state empty for offline friends
    online:
      (persona?.persona_state ?? SteamUser.EPersonaState.Offline) !==
      SteamUser.EPersonaState.Offline,
  };
}

export function getMe(client: SteamUser): Friend {
  if (!client.steamID) {
    throw new Error('Not logged on to Steam');
  }
  return toFriend(client, client.steamID.getSteamID64());
}

export function getFriends(client: SteamUser): Friend[] {
  return Object.entries(client.myFriends)
    .filter(
      ([, relationship]) =>
        relationship === SteamUser.EFriendRelationship.Friend,
    )
    .map(([steamid]) => toFriend(client, steamid))
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
    );
}

export async function getGroups(client: SteamUser): Promise<ChatGroup[]> {
  const { chat_room_groups } = await client.chat.getGroups();
  const groupIds = Object.keys(chat_room_groups);
  if (groupIds.length === 0) return [];
  // summaries leave out room details like voice permissions, the active group state has them
  const { chat_room_groups: states } =
    await client.chat.setSessionActiveGroups(groupIds);
  return groupIds.map((groupId) => {
    const summary = chat_room_groups[groupId].group_summary;
    const rooms = states[groupId]?.chat_rooms ?? summary.chat_rooms;
    return {
      groupId,
      name: summary.chat_group_name,
      rooms: rooms.map((room) => ({
        chatId: room.chat_id,
        // steam leaves the default room unnamed and shows it as General
        name: room.chat_name || 'General',
        voiceAllowed: room.voice_allowed,
        membersInVoice: room.members_in_voice.map((sid) => sid.getSteamID64()),
      })),
    };
  });
}

export async function joinGroupByInviteLink(
  client: SteamUser,
  inviteLink: string,
): Promise<AppMethods['joinGroupByInviteLink']['response']> {
  // the typings make the callback mandatory, so no promise overload
  const info = await new Promise<SteamChatRoomClient.InviteLinkInfo>(
    (resolve, reject) =>
      client.chat.getInviteLinkInfo(inviteLink, (err, response) =>
        err ? reject(err) : resolve(response),
      ),
  );
  const groupId = info.group_summary.chat_group_id;
  await client.chat.joinGroup(groupId, info.invite_code);
  return { groupId };
}
