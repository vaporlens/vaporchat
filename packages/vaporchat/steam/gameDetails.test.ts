import { describe, expect, it } from 'vitest';
import { toGameDetails } from './gameDetails.ts';

// biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
const TRAILER_URL_FORMAT = 'steam/apps/${FILENAME}?t=7';

describe('toGameDetails', () => {
  it('names tags and features, sizes screenshots, streams trailers and says where the game runs', () => {
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
        categories: {
          supported_player_categoryids: [2],
          feature_categoryids: [23, 99],
          controller_categoryids: [57, 58],
        },
        screenshots: {
          all_ages_screenshots: [{ filename: 'steam/apps/10/ss_a.jpg?t=5' }],
        },
        trailers: {
          highlights: [
            {
              trailer_url_format: TRAILER_URL_FORMAT,
              screenshot_full: '20/movie_full.jpg',
              adaptive_trailers: [
                { cdn_path: '10/20/a/dash_h264.mpd', encoding: 'dash_h264' },
                { cdn_path: '10/20/a/hls.m3u8', encoding: 'hls_h264' },
              ],
              all_ages: true,
            },
            {
              trailer_url_format: TRAILER_URL_FORMAT,
              screenshot_full: '21/movie_full.jpg',
              adaptive_trailers: [
                { cdn_path: '10/21/a/hls.m3u8', encoding: 'hls_h264' },
              ],
              all_ages: false,
            },
          ],
          other_trailers: [
            {
              trailer_url_format: TRAILER_URL_FORMAT,
              screenshot_full: '22/movie_full.jpg',
              adaptive_trailers: [
                { cdn_path: '10/22/a/hls.m3u8', encoding: 'hls_h264' },
              ],
              all_ages: true,
            },
          ],
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
      new Map([
        [2, { name: 'Single-player', iconUrl: 'player.png' }],
        [23, { name: 'Steam Cloud', iconUrl: 'cloud.png' }],
        [57, { name: 'DualSense Controller Support', iconUrl: 'pad.png' }],
        [58, { name: 'DualSense Controller Support', iconUrl: 'pad.png' }],
      ]),
    );
    expect(game).toMatchObject({
      shortDescription: 'Short',
      developers: ['Dev'],
      publishers: ['Pub'],
      reviews: { label: 'Very Positive', percentPositive: 91, count: 120 },
      tags: ['Indie', 'Puzzle'],
      features: [
        { name: 'Single-player', iconUrl: 'player.png' },
        { name: 'DualSense Controller Support', iconUrl: 'pad.png' },
        { name: 'Steam Cloud', iconUrl: 'cloud.png' },
      ],
      screenshots: [
        {
          url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/ss_a.jpg?t=5',
          thumbnailUrl:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/ss_a.600x338.jpg?t=5',
        },
      ],
      trailers: [
        {
          url: 'https://video.fastly.steamstatic.com/store_trailers/10/20/a/hls.m3u8',
          posterUrl:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/20/movie_full.jpg?t=7',
        },
        {
          url: 'https://video.fastly.steamstatic.com/store_trailers/10/22/a/hls.m3u8',
          posterUrl:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/22/movie_full.jpg?t=7',
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

  it('has no reviews, features or Steam Deck rating when Steam has none', () => {
    expect(
      toGameDetails(
        { success: 1, appid: 10, reviews: {} },
        new Map(),
        new Map(),
      ),
    ).toMatchObject({
      reviews: null,
      features: [],
      steamDeck: null,
      platforms: [],
    });
  });

  it('has no reviews for a game without any, though Steam labels them', () => {
    expect(
      toGameDetails(
        {
          success: 1,
          appid: 10,
          reviews: {
            summary_filtered: {
              review_count: 0,
              percent_positive: 0,
              review_score_label: 'No user reviews',
            },
          },
        },
        new Map(),
        new Map(),
      ).reviews,
    ).toBeNull();
  });
});
