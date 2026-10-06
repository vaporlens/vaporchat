import type { FeedPage, StoreItem } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import { callApi, context, getStoreItems } from './store.ts';

const PAGE_SIZE = 50;
// biggest discounts first, then in the user's ranking
const SORT_BY_DISCOUNT = 3;

/** A page of the user's wishlist, biggest discounts first, then in their own ranking. */
export async function getWishlist(
  steamid: string,
  { accessToken }: WebSession,
  country: string,
  start: number | null,
): Promise<FeedPage<StoreItem>> {
  // the whole list of ids, it ignores paging
  const { items = [] } = await callApi<{ items?: { appid: number }[] }>(
    'IWishlistService/GetWishlistSortedFiltered',
    { steamid, context: context(country), sort_order: SORT_BY_DISCOUNT },
    accessToken,
  );
  const from = start ?? 0;
  const to = from + PAGE_SIZE;
  return {
    items: await getStoreItems(
      items.slice(from, to).map(({ appid }) => appid),
      country,
    ),
    next: to < items.length ? to : null,
  };
}
