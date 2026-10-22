import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWishlist } from './wishlist.ts';

const SESSION = { sessionid: 's', cookie: 'c', accessToken: 't' };

describe('getWishlist', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('dates each game by when it was added and has its reviews, when the store skips one', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('GetWishlistSortedFiltered')) {
        return Response.json({
          response: {
            items: [
              { appid: 30, date_added: 300 },
              { appid: 20, date_added: 200 },
              { appid: 10, date_added: 100 },
            ],
          },
        });
      }
      // the store no longer shows 20
      return Response.json({
        response: {
          store_items: [
            {
              appid: 30,
              success: 1,
              reviews: {
                summary_filtered: {
                  review_score_label: 'Very Positive',
                  percent_positive: 90,
                  review_count: 500,
                },
              },
            },
            { appid: 20, success: 1, visible: false },
            {
              appid: 10,
              success: 1,
              reviews: {
                summary_filtered: {
                  review_score_label: 'No user reviews',
                  review_count: 0,
                },
              },
            },
          ],
        },
      });
    });
    const { items } = await getWishlist('1', SESSION, 'US', null);
    expect(
      items.map(({ appid, addedAt, reviews }) => ({ appid, addedAt, reviews })),
    ).toEqual([
      {
        appid: 30,
        addedAt: 300_000,
        reviews: { label: 'Very Positive', percentPositive: 90, count: 500 },
      },
      { appid: 10, addedAt: 100_000, reviews: null },
    ]);
  });
});
