import type { FeedPage, WishlistCategory, WishlistGame } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import {
  callApi,
  context,
  DATA_REQUEST,
  fetchStoreItems,
  toReviewSummary,
  toStoreItem,
} from './store.ts';
import { STORE_URL } from './web.ts';

const PAGE_SIZE = 50;
// biggest discounts first, then in the user's ranking
const SORT_BY_DISCOUNT = 3;

/**
 * A page of the user's wishlist, biggest discounts first, then in their own ranking. Only the games
 * in `categoryId` with one.
 */
export async function getWishlist(
  steamid: string,
  { accessToken }: WebSession,
  country: string,
  start: number | null,
  categoryId: string | null,
): Promise<FeedPage<WishlistGame>> {
  // the whole list of ids, it ignores paging
  const { items = [] } = await callApi<{
    items?: { appid: number; date_added?: number }[];
  }>(
    'IWishlistService/GetWishlistSortedFiltered',
    {
      steamid,
      context: context(country),
      sort_order: SORT_BY_DISCOUNT,
      ...(categoryId !== null && { filters: { category_ids: [categoryId] } }),
    },
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

/** The categories the user sorts their wishlist into, none until they make one. */
export async function getWishlistCategories({
  accessToken,
}: WebSession): Promise<WishlistCategory[]> {
  const { categories = [] } = await callApi<{
    categories?: { categoryid: string; name: string; item_count?: number }[];
  }>('IWishlistService/GetWishlistCategories', {}, accessToken);
  return categories.map((category) => ({
    id: category.categoryid,
    name: category.name,
    count: category.item_count ?? 0,
  }));
}

/**
 * The store page of someone's wishlist, showing only `categoryId` with one. It opens for others
 * only while the wishlist is public.
 */
export function wishlistUrl(steamid: string, categoryId: string | null) {
  const url = `${STORE_URL}wishlist/profiles/${steamid}/`;
  return categoryId === null ? url : `${url}?categoryids=${categoryId}`;
}
