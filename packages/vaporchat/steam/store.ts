import type { StoreItem } from '../protocol.ts';
import { API_URL, ASSETS_URL, getJson, inBatches, STORE_URL } from './web.ts';

// the store's own JSON APIs work without logging in
// GetItems takes up to this many ids per request
const BATCH_SIZE = 100;
const SPECIALS_COUNT = 50;
const NEW_RELEASES_COUNT = 50;

/** A store item as the IStore*Service APIs describe it, only what we use. */
export interface ApiStoreItem {
  /** EStoreItemType: 0 app, 1 package, 2 bundle */
  item_type?: number;
  id?: number;
  success?: number;
  visible?: boolean;
  appid?: number;
  name?: string;
  store_url_path?: string;
  is_free?: boolean;
  assets?: { asset_url_format?: string; header?: string };
  release?: { steam_release_date?: number };
  best_purchase_option?: {
    formatted_final_price?: string;
    formatted_original_price?: string;
    discount_pct?: number;
    active_discounts?: { discount_end_date?: number }[];
  };
}

/** Calls a store WebAPI method, `IStoreBrowseService/GetItems` say, with a JSON request. */
export function callApi<T>(method: string, request: object) {
  const input = encodeURIComponent(JSON.stringify(request));
  return getJson<{ response?: T }>(
    `${API_URL}${method}/v1/?input_json=${input}`,
  ).then(({ response }) => response ?? ({} as T));
}

// without a country the store APIs answer with nothing at all
export function context(country: string) {
  return { language: 'english', country_code: country };
}

const DATA_REQUEST = { include_assets: true, include_release: true };

export function toStoreItem(item: ApiStoreItem): StoreItem {
  const { assets, best_purchase_option: offer } = item;
  const discounted = (offer?.discount_pct ?? 0) > 0;
  const endsAt = offer?.active_discounts?.[0]?.discount_end_date;
  const released = item.release?.steam_release_date;
  return {
    appid: item.appid ?? null,
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
    releasedAt: released ? released * 1000 : null,
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

/** The store's top discounts right now, like the Discounts & Events page. */
export async function getSpecials(country: string) {
  const { specials = [] } = await callApi<{
    specials?: { item?: ApiStoreItem }[];
  }>('IStoreMarketingService/GetItemsToFeature', {
    context: context(country),
    data_request: DATA_REQUEST,
    include_top_specials_count: SPECIALS_COUNT,
  });
  return specials.flatMap(({ item }) => (item ? [toStoreItem(item)] : []));
}

/** The app ids in a store search result, which only has them in its picture URLs. */
export function appidsFromSearch(items: { logo?: string }[]) {
  return items.flatMap(({ logo }) => {
    const appid = logo?.match(/\/steam\/apps\/(\d+)\//)?.[1];
    return appid ? [Number(appid)] : [];
  });
}

/** Popular new releases, newest first, like the store's New Releases page. */
export async function getNewReleases(country: string) {
  const { items = [] } = await getJson<{ items?: { logo?: string }[] }>(
    `${STORE_URL}search/results/?filter=popularnew&sort_by=Released_DESC&start=0` +
      `&count=${NEW_RELEASES_COUNT}&cc=${country}&l=english&json=1`,
  );
  return getStoreItems(appidsFromSearch(items), country);
}
