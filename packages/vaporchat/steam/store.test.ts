import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appidsFromSearch,
  countryFromPage,
  getSpecials,
  getTopSellers,
  toStoreItem,
} from './store.ts';

const ASSETS = {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
  asset_url_format: 'steam/apps/10/${FILENAME}?t=1',
  header: 'abc/header.jpg',
};

describe('countryFromPage', () => {
  it("reads the country from the page's config", () => {
    expect(
      countryFromPage(
        '<div id="application_config" data-config="{&quot;LANGUAGE&quot;:&quot;english&quot;,&quot;COUNTRY&quot;:&quot;FR&quot;,&quot;CDN_URL&quot;:&quot;x&quot;}">',
      ),
    ).toBe('FR');
  });

  it('fails on a page without one', () => {
    expect(() => countryFromPage('<html></html>')).toThrow();
  });
});

describe('toStoreItem', () => {
  it('has the discount, its end and the header picture of a discounted game', () => {
    expect(
      toStoreItem({
        appid: 10,
        name: 'Game',
        store_url_path: 'app/10/Game',
        assets: ASSETS,
        release: { steam_release_date: 1000 },
        best_purchase_option: {
          formatted_final_price: '$5.00',
          formatted_original_price: '$10.00',
          discount_pct: 50,
          active_discounts: [{ discount_end_date: 2000 }],
        },
      }),
    ).toEqual({
      appid: 10,
      includedAppids: [],
      name: 'Game',
      url: 'https://store.steampowered.com/app/10/Game',
      imageUrl:
        'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/abc/header.jpg?t=1',
      price: '$5.00',
      originalPrice: '$10.00',
      discountPercent: 50,
      discountEndsAt: 2_000_000,
      releasedAt: 1_000_000,
      releaseWindow: null,
      comingSoon: false,
      free: false,
    });
  });

  it('has the games of a bundle', () => {
    expect(
      toStoreItem({ item_type: 2, id: 5, included_appids: [10, 20] }),
    ).toMatchObject({ appid: null, includedAppids: [10, 20] });
  });

  it("has a package's header picture", () => {
    expect(
      toStoreItem({
        item_type: 1,
        id: 5,
        assets: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
          asset_url_format: 'steam/subs/5/${FILENAME}?t=1',
          package_header: 'abc/header.jpg',
        },
      }).imageUrl,
    ).toBe(
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/subs/5/abc/header.jpg?t=1',
    );
  });

  it('has no original price or discount end without a discount', () => {
    const item = toStoreItem({
      appid: 10,
      best_purchase_option: {
        formatted_final_price: '$10.00',
        formatted_original_price: '$10.00',
        discount_pct: 0,
      },
    });
    expect(item).toMatchObject({
      price: '$10.00',
      originalPrice: null,
      discountEndsAt: null,
    });
  });

  it('has the release date of a coming game when it is a full date, else its window', () => {
    const coming = (coming_soon_display: string) => {
      const { releasedAt, releaseWindow } = toStoreItem({
        appid: 10,
        release: { steam_release_date: 1000, coming_soon_display },
      });
      return { releasedAt, releaseWindow };
    };
    expect(coming('date_full')).toEqual({
      releasedAt: 1_000_000,
      releaseWindow: null,
    });
    expect(coming('date_quarter')).toEqual({
      releasedAt: null,
      releaseWindow: { at: 1_000_000, precision: 'quarter' },
    });
    expect(coming('text_tba')).toEqual({
      releasedAt: null,
      releaseWindow: null,
    });
  });

  it('is coming soon only when Steam says so, with a date or without', () => {
    expect(
      toStoreItem({ appid: 10, release: { is_coming_soon: true } }).comingSoon,
    ).toBe(true);
    expect(toStoreItem({ appid: 10 }).comingSoon).toBe(false);
  });

  it('has no price when free or not for sale yet', () => {
    expect(toStoreItem({ appid: 10, is_free: true })).toMatchObject({
      price: null,
      free: true,
    });
    expect(toStoreItem({ appid: 10 })).toMatchObject({
      price: null,
      free: false,
    });
  });
});

describe('appidsFromSearch', () => {
  it('takes app ids from the pictures, skipping bundles and packages', () => {
    const logo = (path: string) => ({
      logo: `https://shared.akamai.steamstatic.com/store_item_assets/steam/${path}/x/capsule_sm_120.jpg?t=1`,
    });
    expect(
      appidsFromSearch([
        logo('apps/30'),
        logo('bundles/40'),
        logo('subs/50'),
        {},
        logo('apps/10'),
      ]),
    ).toEqual([30, 10]);
  });
});

/**
 * Answers like the store would for a list of `total` games, appids 1 to `total` in order.
 * Search results of `bundleEvery`th place are bundles, which have no appid in their picture.
 */
function stubStore(total: number, bundleEvery = 0) {
  const appids = Array.from({ length: total }, (_, i) => i + 1);
  const item = (appid: number) => ({
    appid,
    success: 1,
    name: `Game ${appid}`,
  });
  vi.stubGlobal('fetch', async (url: string) => {
    const { searchParams } = new URL(url);
    const input = JSON.parse(searchParams.get('input_json') ?? '{}');
    if (url.includes('GetItemsToFeature')) {
      const count: number = input.include_top_specials_count;
      return Response.json({
        response: {
          specials: appids.slice(0, count).map((id) => ({ item: item(id) })),
        },
      });
    }
    if (url.includes('GetItems')) {
      return Response.json({
        response: {
          store_items: input.ids.map(({ appid }: { appid: number }) =>
            item(appid),
          ),
        },
      });
    }
    const start = Number(searchParams.get('start'));
    const count = Number(searchParams.get('count'));
    return Response.json({
      items: appids.slice(start, start + count).map((appid) => ({
        logo:
          bundleEvery && appid % bundleEvery === 0
            ? `https://example.com/steam/bundles/${appid}/capsule.jpg`
            : `https://example.com/steam/apps/${appid}/capsule.jpg`,
      })),
    });
  });
}

describe('getSpecials', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pages on from where the last page ended, until the store has no more', async () => {
    stubStore(120);
    const first = await getSpecials('US', null);
    const second = await getSpecials('US', first.next);
    const third = await getSpecials('US', second.next);
    expect([first, second, third].map((page) => page.items.length)).toEqual([
      50, 50, 20,
    ]);
    expect(second.items[0].appid).toBe(51);
    expect(third.next).toBeNull();
  });
});

describe('store search lists', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pages on from where the last page ended, until a page comes short', async () => {
    stubStore(70);
    const first = await getTopSellers('US', null);
    const second = await getTopSellers('US', first.next);
    expect(second.items.map((game) => game.appid)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 51),
    );
    expect(second.next).toBeNull();
  });

  it('keeps paging when bundles left out make a full page look short', async () => {
    stubStore(120, 10);
    const first = await getTopSellers('US', null);
    expect(first.items).toHaveLength(45);
    expect(first.next).not.toBeNull();
  });
});
