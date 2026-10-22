import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGameDetails, toGameDetails } from './gameDetails.ts';

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
      tags: [
        { tagid: 2, name: 'Indie' },
        { tagid: 1, name: 'Puzzle' },
      ],
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

  it('lists editions, links and requirements like the store page', () => {
    const game = toGameDetails(
      {
        success: 1,
        appid: 10,
        purchase_options: [
          {
            purchase_option_name: 'Game',
            formatted_final_price: '9,99€',
            formatted_original_price: '19,99€',
            discount_pct: 50,
          },
          {
            purchase_option_name: 'Game Deluxe',
            formatted_final_price: '29,99€',
            formatted_original_price: '29,99€',
          },
        ],
        links: [
          { url: 'https://discord.gg/game' },
          { url: 'https://game.example.com' },
          { url: 'https://www.youtube.com/@game' },
        ],
        extra_details: {
          links_and_info: { website: 'https://game.example.com' },
          system_requirements: {
            platforms: [
              {
                platform: 1,
                minimum: {
                  os_version: 'Windows 10',
                  memory: { amount: '8', units: 'GB' },
                  directx: '12',
                  broadband: true,
                  storage: { amount: '70', units: 'GB' },
                },
                recommended: { legacy_bbcode: '[b]A fast PC[/b]' },
              },
              // a token the store translates, nothing to show
              { platform: 2, minimum: { legacy_bbcode: '#sys_req_old' } },
              { platform: 99, minimum: { os_version: 'Other' } },
            ],
          },
        },
      },
      new Map(),
      new Map(),
    );
    expect(game.editions).toEqual([
      {
        name: 'Game',
        price: '9,99€',
        originalPrice: '19,99€',
        discountPercent: 50,
      },
      {
        name: 'Game Deluxe',
        price: '29,99€',
        originalPrice: null,
        discountPercent: 0,
      },
    ]);
    expect(game.links).toEqual([
      { label: 'Website', url: 'https://game.example.com' },
      { label: 'discord.gg', url: 'https://discord.gg/game' },
      { label: 'youtube.com', url: 'https://www.youtube.com/@game' },
    ]);
    expect(game.requirements).toEqual([
      {
        platform: 'Windows',
        minimum: {
          rows: [
            { label: 'OS', value: 'Windows 10' },
            { label: 'Memory', value: '8 GB RAM' },
            { label: 'DirectX', value: 'Version 12' },
            { label: 'Network', value: 'Broadband Internet connection' },
            { label: 'Storage', value: '70 GB available space' },
          ],
          text: [],
        },
        recommended: {
          rows: [],
          text: [
            {
              kind: 'paragraph',
              spans: [{ text: 'A fast PC', bold: true }],
            },
          ],
        },
      },
    ]);
  });

  it("has Early Access answers only for a game in Early Access, in the store's order", () => {
    const extra_details = {
      early_access: {
        how_long_bbcode: 'About a year',
        why_bbcode: 'To hear from players',
        pricing_bbcode: '',
      },
    };
    expect(
      toGameDetails(
        {
          success: 1,
          appid: 10,
          release: { is_early_access: true },
          extra_details,
        },
        new Map(),
        new Map(),
      ).earlyAccess,
    ).toEqual([
      {
        question: 'Why Early Access?',
        answer: [
          { kind: 'paragraph', spans: [{ text: 'To hear from players' }] },
        ],
      },
      {
        question: 'How long will this game be in Early Access?',
        answer: [{ kind: 'paragraph', spans: [{ text: 'About a year' }] }],
      },
    ]);
    // released games keep their old answers
    expect(
      toGameDetails(
        { success: 1, appid: 10, extra_details },
        new Map(),
        new Map(),
      ).earlyAccess,
    ).toBeNull();
  });
});

describe('getGameDetails', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the page without DLC when looking the DLC up fails', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('GetDLCForAppsSolr'))
        return new Response('', { status: 500 });
      if (url.includes('GetItems'))
        return Response.json({
          response: { store_items: [{ success: 1, appid: 10, name: 'Game' }] },
        });
      // tag and category names
      return Response.json({ response: {} });
    });
    expect(await getGameDetails(10, 'DE')).toMatchObject({
      name: 'Game',
      dlc: [],
    });
  });
});
