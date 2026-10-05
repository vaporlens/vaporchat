import { describe, expect, it } from 'vitest';
import type { StoreItem } from '../protocol.ts';
import { toFriendActivities } from './friendsActivity.ts';

const FRIEND = '76561197960287930';
const OTHER = '76561197960287931';

const game = (appid: number) => ({ appid, name: `Game ${appid}` }) as StoreItem;

describe('toFriendActivities', () => {
  it('has the unlocked achievements of an achievement event, with their icons', () => {
    const [activity] = toFriendActivities(
      {
        news: [
          {
            eventtype: 2,
            eventtime: 100,
            steamid_actor: FRIEND,
            gameid: '10',
            achievement_names: ['WIN'],
          },
        ],
        achievement_display_data: [
          {
            appid: 10,
            achievements: [
              {
                name: 'WIN',
                display_name: 'Winner',
                display_description: 'Win once',
                icon: 'win.jpg',
              },
              { name: 'LOSE', display_name: 'Loser', icon: 'lose.jpg' },
            ],
          },
        ],
      },
      new Map([[10, game(10)]]),
    );
    expect(activity).toMatchObject({
      kind: 'achievement',
      time: 100_000,
      actor: FRIEND,
      game: game(10),
      achievements: [
        {
          name: 'Winner',
          description: 'Win once',
          iconUrl:
            'https://shared.fastly.steamstatic.com/community_assets/images/apps/10/win.jpg',
        },
      ],
      url: `https://steamcommunity.com/profiles/${FRIEND}/stats/10/achievements/`,
    });
  });

  it("is about a purchased package's first app, and the new friend of a friend", () => {
    const [purchase, friendAdded] = toFriendActivities(
      {
        news: [
          {
            eventtype: 3,
            eventtime: 100,
            steamid_actor: FRIEND,
            gameid: '0',
            appids: [20, 21],
          },
          {
            eventtype: 1,
            eventtime: 90,
            steamid_actor: FRIEND,
            steamid_target: OTHER,
          },
        ],
      },
      new Map([[20, game(20)]]),
    );
    expect(purchase).toMatchObject({
      kind: 'purchase',
      game: game(20),
      url: 'https://store.steampowered.com/app/20/',
    });
    expect(friendAdded).toMatchObject({
      kind: 'friendAdded',
      target: OTHER,
      game: null,
      url: `https://steamcommunity.com/profiles/${OTHER}/`,
    });
  });

  it('links screenshots to their page and leaves out kinds it has no words for', () => {
    const activities = toFriendActivities(
      {
        news: [
          { eventtype: 16, eventtime: 100, steamid_actor: FRIEND },
          {
            eventtype: 13,
            eventtime: 90,
            steamid_actor: FRIEND,
            gameid: '10',
            publishedfileid: '555',
          },
        ],
      },
      new Map(),
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      kind: 'screenshot',
      url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=555',
    });
  });
});
