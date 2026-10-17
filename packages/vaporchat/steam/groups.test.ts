import { describe, expect, it } from 'vitest';
import type { ChatGroup } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import { getGroups, groupTitle, setGroupAlerts } from './groups.ts';

function group(name: string, memberIds: string[]): ChatGroup {
  return {
    groupId: '1',
    name,
    avatarUrl: null,
    memberIds,
    rooms: [],
    alerts: 'all',
  };
}

/** Answers calls with canned responses, records them. */
function fakeSteam(responses: Record<string, object> = {}) {
  const calls: { method: string; body: object }[] = [];
  const cm = {
    async call(method: string, body: object) {
      calls.push({ method, body });
      return responses[method] ?? {};
    },
  };
  return { cm: cm as unknown as SteamCM, calls };
}

describe('group alerts', () => {
  it("reads Steam's mobile setting per group, unset as mentions", async () => {
    const summary = (id: string) => ({ chat_group_id: id, chat_rooms: [] });
    const steam = fakeSteam({
      'ChatRoom.GetMyChatRoomGroups#1': {
        chat_room_groups: [
          {
            group_summary: summary('1'),
            user_chat_group_state: { mobile_notification_level: 4 },
          },
          {
            group_summary: summary('2'),
            user_chat_group_state: { mobile_notification_level: 1 },
          },
          {
            group_summary: summary('3'),
            user_chat_group_state: { mobile_notification_level: 2 },
          },
          { group_summary: summary('4'), user_chat_group_state: {} },
        ],
      },
    });
    const groups = await getGroups(steam.cm);
    expect(groups.map((g) => g.alerts)).toEqual([
      'all',
      'none',
      'mentions',
      'mentions',
    ]);
  });

  it("sets the group's mobile setting", async () => {
    const steam = fakeSteam();
    await setGroupAlerts(steam.cm, '7', 'none');
    await setGroupAlerts(steam.cm, '7', 'mentions');
    expect(steam.calls).toEqual([
      {
        method: 'ChatRoom.SetUserChatGroupPreferences#1',
        body: {
          chat_group_id: '7',
          chat_group_preferences: { mobile_notification_level: 1 },
        },
      },
      {
        method: 'ChatRoom.SetUserChatGroupPreferences#1',
        body: {
          chat_group_id: '7',
          // mentions of us or everyone, like steam's clients offer
          chat_group_preferences: { mobile_notification_level: 3 },
        },
      },
    ]);
  });
});

const names: Record<string, string> = { me: 'Me', a: 'Ann', b: 'Bob' };
const nameOf = (steamid: string) => names[steamid] ?? steamid;

describe('groupTitle', () => {
  it('uses the name the group has', () => {
    expect(groupTitle(group('Raid night', ['me', 'a']), 'me', nameOf)).toBe(
      'Raid night',
    );
  });

  it('names an unnamed group after its other members', () => {
    expect(groupTitle(group('', ['a', 'me', 'b']), 'me', nameOf)).toBe(
      'Ann, Bob',
    );
  });
});
