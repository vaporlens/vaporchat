import type { FeedPage, WishlistGame } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import {
  callApi,
  context,
  DATA_REQUEST,
  fetchStoreItems,
  toReviewSummary,
  toStoreItem,
} from './store.ts';

const PAGE_SIZE = 50;
// biggest discounts first, then in the user's ranking
const SORT_BY_DISCOUNT = 3;

/** A page of the user's wishlist, biggest discounts first, then in their own ranking. */
export async function getWishlist(
  steamid: string,
  { accessToken }: WebSession,
  country: string,
  start: number | null,
): Promise<FeedPage<WishlistGame>> {
  // the whole list of ids, it ignores paging
  const { items = [] } = await callApi<{
    items?: { appid: number; date_added?: number }[];
  }>(
    'IWishlistService/GetWishlistSortedFiltered',
    { steamid, context: context(country), sort_order: SORT_BY_DISCOUNT },
    accessToken,
  );
  const from = start ?? 0;
  const to = from + PAGE_SIZE;
  const page = items.slice(from, to);
  const added = new Map(page.map((item) => [item.appid, item.date_added]));
  const games = await fetchStoreItems(
    page.map(({ appid }) => ({ appid })),
    country,
    { ...DATA_REQUEST, include_reviews: true },
  );
  return {
    items: games.map((game) => ({
      ...toStoreItem(game),
      addedAt: (added.get(game.appid ?? 0) ?? 0) * 1000,
      reviews: toReviewSummary(game),
    })),
    next: to < items.length ? to : null,
  };
}
