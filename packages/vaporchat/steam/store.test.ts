import { describe, expect, it } from 'vitest';
import { appidsFromSearch, toStoreItem } from './store.ts';

const ASSETS = {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
  asset_url_format: 'steam/apps/10/${FILENAME}?t=1',
  header: 'abc/header.jpg',
};

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
      free: false,
    });
  });

  it('has the games of a bundle', () => {
    expect(
      toStoreItem({ item_type: 2, id: 5, included_appids: [10, 20] }),
    ).toMatchObject({ appid: null, includedAppids: [10, 20] });
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

  it('has the release date of a coming game only when it is a full date', () => {
    const coming = (coming_soon_display: string) =>
      toStoreItem({
        appid: 10,
        release: { steam_release_date: 1000, coming_soon_display },
      }).releasedAt;
    expect(coming('date_full')).toBe(1_000_000);
    expect(coming('date_quarter')).toBeNull();
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
