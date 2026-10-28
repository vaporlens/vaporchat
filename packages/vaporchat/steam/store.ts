import type {
  FeedPage,
  ReleaseWindow,
  ReviewSummary,
  SpecialsFilter,
  SpecialsSort,
  StoreBrowse,
  StoreHub,
  StoreItem,
  StoreRef,
  StoreTag,
} from '../protocol.ts';
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
  /** packages have only `package_header` */
  assets?: {
    asset_url_format?: string;
    header?: string;
    package_header?: string;
  };
  release?: {
    steam_release_date?: number;
    /** how precise the date of a coming game is: `date_full`, `date_month`, `date_quarter`… */
    coming_soon_display?: string;
    is_coming_soon?: boolean;
  };
  /** with `include_reviews` */
  reviews?: {
    summary_filtered?: {
      review_count?: number;
      percent_positive?: number;
      review_score_label?: string;
    };
  };
  best_purchase_option?: {
    packageid?: number;
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

/** Like `callApi`, anonymously, for the methods Steam answers GET with 405 for. */
export async function postApi<T>(method: string, request: object) {
  const form = new FormData();
  form.append('input_json', JSON.stringify(request));
  const response = await fetch(`${API_URL}${method}/v1/`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Steam answered HTTP ${response.status} for ${method}`);
  }
  const { response: result } = (await response.json()) as { response?: T };
  return result ?? ({} as T);
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

export const DATA_REQUEST = { include_assets: true, include_release: true };

// how precise a coming game's date is, without a day
const WINDOWS: Record<string, ReleaseWindow['precision'] | undefined> = {
  date_month: 'month',
  date_quarter: 'quarter',
  date_year: 'year',
};

export function toStoreItem(item: ApiStoreItem): StoreItem {
  const { assets, best_purchase_option: offer } = item;
  const header = assets?.header ?? assets?.package_header;
  const discounted = (offer?.discount_pct ?? 0) > 0;
  const endsAt = offer?.active_discounts?.[0]?.discount_end_date;
  const { steam_release_date: released, coming_soon_display: precision } =
    item.release ?? {};
  const rough = precision ? WINDOWS[precision] : undefined;
  return {
    appid: item.appid ?? null,
    includedAppids: item.appid ? [] : (item.included_appids ?? []),
    name: item.name ?? '',
    url: STORE_URL + (item.store_url_path ?? ''),
    imageUrl:
      assets?.asset_url_format && header
        ? ASSETS_URL +
          // biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
          assets.asset_url_format.replace('${FILENAME}', header)
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
    releaseWindow:
      released && rough ? { at: released * 1000, precision: rough } : null,
    comingSoon: item.release?.is_coming_soon ?? false,
    free: item.is_free ?? false,
  };
}

/** Its reviews in short, null without enough of them. */
export function toReviewSummary(item: ApiStoreItem): ReviewSummary | null {
  const reviews = item.reviews?.summary_filtered;
  // an upcoming game's label is `No user reviews`
  return reviews?.review_score_label && reviews.review_count
    ? {
        label: reviews.review_score_label,
        percentPositive: reviews.percent_positive ?? 0,
        count: reviews.review_count,
      }
    : null;
}

/** Store items as GetItems describes them, in the order asked. Ones the store doesn't show are left out. */
export async function fetchStoreItems(
  refs: StoreRef[],
  country: string,
  dataRequest: typeof DATA_REQUEST & {
    include_reviews?: boolean;
  } = DATA_REQUEST,
) {
  const items = await inBatches(refs, BATCH_SIZE, async (ids) => {
    const { store_items = [] } = await callApi<{
      store_items?: ApiStoreItem[];
    }>('IStoreBrowseService/GetItems', {
      ids,
      context: context(country),
      data_request: dataRequest,
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

// IStoreQueryService/Query's sort orders, no enum names them: worked out from what each gives
const SPECIALS_SORTS: Record<SpecialsSort, number> = {
  // the store's own Top Grossing menu
  topSellers: 10,
  // highest percent positive first
  reviews: 21,
  // popular releases of the last weeks
  trending: 20,
};

export const ALL_SPECIALS: SpecialsFilter = {
  minDiscount: 0,
  minReviewScore: 0,
  sort: 'topSellers',
};

/**
 * A page of the games and DLC discounted right now, like the store's Specials page, only those
 * `filter` lets through. `start` is the `next` of the previous page.
 */
export async function getSpecials(
  country: string,
  start: number | null,
  filter = ALL_SPECIALS,
): Promise<FeedPage<StoreItem>> {
  const from = start ?? 0;
  const to = from + PAGE_SIZE;
  const minDiscount = Math.max(1, filter.minDiscount);
  const { store_items = [], metadata } = await callApi<{
    store_items?: ApiStoreItem[];
    metadata?: { total_matching_records?: number };
  }>('IStoreQueryService/Query', {
    query: {
      start: from,
      count: PAGE_SIZE,
      sort: SPECIALS_SORTS[filter.sort],
      filters: {
        // it gives no bundles or packages whatever is asked
        type_filters: { include_games: true, include_dlc: true },
        price_filters: { min_discount_percent: minDiscount },
        ...(filter.minReviewScore && {
          review_score_filter: { min_score: filter.minReviewScore },
        }),
      },
    },
    context: context(country),
    data_request: DATA_REQUEST,
  });
  return {
    items: store_items
      .filter((item) => item.success === 1 && item.visible !== false)
      .map(toStoreItem)
      // it counts another edition's or a bundle's discount, the card shows the best price's
      .filter((item) => item.discountPercent >= minDiscount),
    next: to < (metadata?.total_matching_records ?? 0) ? to : null,
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

/** What the store finds for `term`, best matches first, like its search page. */
export function searchGames(
  term: string,
  country: string,
  start: number | null,
) {
  return searchStore(`term=${encodeURIComponent(term)}`, country, start);
}

// the store search's filters for each hub, games only (`category1=998`) but for demos
const HUB_FILTERS: Record<StoreHub, string> = {
  freeToPlay: 'tags=113&category1=998',
  demos: 'category1=10',
  earlyAccess: 'tags=493&category1=998',
  // 401 is VR only
  vr: 'vrsupport=402&category1=998',
  deck: 'deck_compatibility=3&category1=998',
};

function browseFilter(browse: StoreBrowse) {
  return browse.kind === 'hub'
    ? HUB_FILTERS[browse.hub]
    : `tags=${browse.tag.tagid}&category1=998`;
}

/** The store's search page listing a hub's or tag's games. */
export function browseUrl(browse: StoreBrowse) {
  return `${STORE_URL}search/?${browseFilter(browse)}`;
}

/**
 * A hub's or tag's games, most popular first, like the store's search for them. With `term`,
 * those the store finds for it, best matches first.
 */
export function browseGames(
  browse: StoreBrowse,
  country: string,
  start: number | null,
  term = '',
) {
  const filter = browseFilter(browse);
  return searchStore(
    term ? `${filter}&term=${encodeURIComponent(term)}` : filter,
    country,
    start,
  );
}

/** The store's tags, the most used first. */
export async function getPopularTags() {
  const { tags = [] } = await callApi<{ tags?: StoreTag[] }>(
    'IStoreService/GetMostPopularTags',
    { language: 'english' },
  );
  return tags;
}
