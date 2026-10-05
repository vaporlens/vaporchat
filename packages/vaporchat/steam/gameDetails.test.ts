import { describe, expect, it } from 'vitest';
import { toGameDetails } from './gameDetails.ts';

describe('toGameDetails', () => {
  it('names tags, sizes screenshots and says where the game runs', () => {
    const game = toGameDetails(
      {
        success: 1,
        appid: 10,
        name: 'Game',
        basic_info: {
          short_description: 'Short',
          developers: [{ name: 'Dev' }],
          publishers: [{ name: 'Pub' }, {}],
        },
        reviews: {
          summary_filtered: {
            review_count: 120,
            percent_positive: 91,
            review_score_label: 'Very Positive',
          },
        },
        tags: [{ tagid: 2 }, { tagid: 99 }, { tagid: 1 }],
        screenshots: {
          all_ages_screenshots: [{ filename: 'steam/apps/10/ss_a.jpg?t=5' }],
        },
        platforms: {
          windows: true,
          steamos_linux: true,
          steam_deck_compat_category: 2,
        },
        full_description_bbcode: '[img]{STEAM_APP_IMAGE}/extras/x.png[/img]',
      },
      new Map([
        [1, 'Puzzle'],
        [2, 'Indie'],
      ]),
    );
    expect(game).toMatchObject({
      shortDescription: 'Short',
      developers: ['Dev'],
      publishers: ['Pub'],
      reviews: { label: 'Very Positive', percentPositive: 91, count: 120 },
      tags: ['Indie', 'Puzzle'],
      screenshots: [
        {
          url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/ss_a.jpg?t=5',
          thumbnailUrl:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/ss_a.600x338.jpg?t=5',
        },
      ],
      platforms: ['Windows', 'Linux'],
      steamDeck: 'playable',
      description: [
        {
          kind: 'image',
          url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/extras/x.png',
        },
      ],
    });
  });

  it('has no reviews or Steam Deck rating when Steam has none', () => {
    expect(
      toGameDetails({ success: 1, appid: 10, reviews: {} }, new Map()),
    ).toMatchObject({ reviews: null, steamDeck: null, platforms: [] });
  });
});
