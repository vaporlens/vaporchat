import type { FeedPage, StoreItem } from '../protocol.ts';
import {
  API_URL,
  ASSETS_URL,
  getJson,
  getText,
  inBatches,
  STORE_URL,
} from './web.ts';

// the store's own JSON APIs work without logging in, `callApi` can call them as the user too
// GetItems takes up to this many ids per request
const BATCH_SIZE = 100;
const PAGE_SIZE = 50;

/** A store item as the IStore*Service APIs describe it, only what we use. */
export interface ApiStoreItem {
  /** EStoreItemType: 0 app, 1 package, 2 bundle */
  item_type?: number;
  id?: number;
  success?: number;
  visible?: boolean;
  appid?: number;
  /** a bundle's or package's apps */
  included_appids?: number[];
  name?: string;
  store_url_path?: string;
  is_free?: boolean;
  assets?: { asset_url_format?: string; header?: string };
  release?: {
    steam_release_date?: number;
    /** how precise the date of a coming game is: `date_full`, `date_month`, `date_quarter`… */
    coming_soon_display?: string;
  };
  best_purchase_option?: {
    formatted_final_price?: string;
    formatted_original_price?: string;
    discount_pct?: number;
    active_discounts?: { discount_end_date?: number }[];
  };
}

/**
 * Calls a store WebAPI method, `IStoreBrowseService/GetItems` say, with a JSON request. As the
 * user with an access token, see `WebSession`.
 */
export function callApi<T>(
  method: string,
  request: object,
  accessToken?: string,
) {
  const input = encodeURIComponent(JSON.stringify(request));
  const token = accessToken ? `&access_token=${accessToken}` : '';
  return getJson<{ response?: T }>(
    `${API_URL}${method}/v1/?input_json=${input}${token}`,
  ).then(({ response }) => response ?? ({} as T));
}

// without a country the store APIs answer with nothing at all
export function context(country: string) {
  return { language: 'english', country_code: country };
}

/** The country in a store page's config, where Steam located who loaded it. */
export function countryFromPage(html: string) {
  const country = html.match(/&quot;COUNTRY&quot;:&quot;([A-Z]{2})&quot;/)?.[1];
  if (!country) throw new Error('Steam gave no country');
  return country;
}

/**
 * Where Steam locates us without logging on, the store's prices follow it. No JSON API tells,
 * its smallest page does.
 */
export async function getStoreCountry() {
  return countryFromPage(await getText(`${STORE_URL}login/`));
}

const DATA_REQUEST = { include_assets: true, include_release: true };

export function toStoreItem(item: ApiStoreItem): StoreItem {
  const { assets, best_purchase_option: offer } = item;
  const discounted = (offer?.discount_pct ?? 0) > 0;
  const endsAt = offer?.active_discounts?.[0]?.discount_end_date;
  const { steam_release_date: released, coming_soon_display: precision } =
    item.release ?? {};
  return {
    appid: item.appid ?? null,
    includedAppids: item.appid ? [] : (item.included_appids ?? []),
    name: item.name ?? '',
    url: STORE_URL + (item.store_url_path ?? ''),
    imageUrl:
      assets?.asset_url_format && assets.header
        ? ASSETS_URL +
          // biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
          assets.asset_url_format.replace('${FILENAME}', assets.header)
        : null,
    price: item.is_free ? null : (offer?.formatted_final_price ?? null),
    originalPrice: discounted
      ? (offer?.formatted_original_price ?? null)
      : null,
    discountPercent: offer?.discount_pct ?? 0,
    discountEndsAt: discounted && endsAt ? endsAt * 1000 : null,
    // a coming game's month, quarter or year comes as the period's last day, no use showing
    releasedAt:
      released && (precision ?? 'date_full') === 'date_full'
        ? released * 1000
        : null,
    free: item.is_free ?? false,
  };
}

/** How the store APIs refer to an app, a bundle or a package. */
export type StoreRef =
  | { appid: number }
  | { bundleid: number }
  | { packageid: number };

/** Store items as GetItems describes them, in the order asked. Ones the store doesn't show are left out. */
export async function fetchStoreItems(refs: StoreRef[], country: string) {
  const items = await inBatches(refs, BATCH_SIZE, async (ids) => {
    const { store_items = [] } = await callApi<{
      store_items?: ApiStoreItem[];
    }>('IStoreBrowseService/GetItems', {
      ids,
      context: context(country),
      data_request: DATA_REQUEST,
    });
    return store_items;
  });
  return items.filter((item) => item.success === 1 && item.visible !== false);
}

/** Store items by appid, for looking games up. Apps the store doesn't show are left out. */
export async function getGames(appids: number[], country: string) {
  const games = await getStoreItems(appids, country);
  return new Map(games.map((game) => [game.appid, game]));
}

/** Store items by appid, in the order asked. Apps the store doesn't show are left out. */
export async function getStoreItems(
  appids: number[],
  country: string,
): Promise<StoreItem[]> {
  const items = await fetchStoreItems(
    appids.map((appid) => ({ appid })),
    country,
  );
  return items.map(toStoreItem);
}

/**
 * A page of the store's top discounts right now, like the Discounts & Events page. `start` is
 * the `next` of the previous page.
 */
export async function getSpecials(
  country: string,
  start: number | null,
): Promise<FeedPage<StoreItem>> {
  // it has no offset, a page is the end of a longer list, up to about a thousand. Its order
  // shifts a little with the length asked, so pages can repeat or skip an item
  const from = start ?? 0;
  const to = from + PAGE_SIZE;
  const { specials = [] } = await callApi<{
    specials?: { item?: ApiStoreItem }[];
  }>('IStoreMarketingService/GetItemsToFeature', {
    context: context(country),
    data_request: DATA_REQUEST,
    include_top_specials_count: to,
  });
  return {
    items: specials
      .slice(from)
      .flatMap(({ item }) => (item ? [toStoreItem(item)] : [])),
    next: specials.length >= to ? to : null,
  };
}

/** The app ids in a store search result, which only has them in its picture URLs. */
export function appidsFromSearch(items: { logo?: string }[]) {
  return items.flatMap(({ logo }) => {
    const appid = logo?.match(/\/steam\/apps\/(\d+)\//)?.[1];
    return appid ? [Number(appid)] : [];
  });
}

/**
 * A page of games of a store search, `filter=topsellers` say, in the order the store gives.
 * `start` is the `next` of the previous page.
 */
async function searchStore(
  query: string,
  country: string,
  start: number | null,
): Promise<FeedPage<StoreItem>> {
  const from = start ?? 0;
  const to = from + PAGE_SIZE;
  const { items = [] } = await getJson<{ items?: { logo?: string }[] }>(
    `${STORE_URL}search/results/?${query}&start=${from}&count=${PAGE_SIZE}` +
      `&cc=${country}&l=english&json=1`,
  );
  return {
    items: await getStoreItems(appidsFromSearch(items), country),
    next: items.length >= PAGE_SIZE ? to : null,
  };
}

/** Popular new releases, newest first, like the store's New Releases page. */
export function getNewReleases(country: string, start: number | null) {
  return searchStore('filter=popularnew&sort_by=Released_DESC', country, start);
}

/** Popular games coming soon, like the store's Upcoming page. */
export function getUpcoming(country: string, start: number | null) {
  return searchStore('filter=popularcomingsoon', country, start);
}

/** The store's top sellers right now, best selling first. */
export function getTopSellers(country: string, start: number | null) {
  return searchStore('filter=topsellers', country, start);
}
