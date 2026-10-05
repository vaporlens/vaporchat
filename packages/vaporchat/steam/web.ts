// Steam's websites and their JSON endpoints, which the store, news and image upload use.
// Browsers can't reach them without a proxy (no CORS).

export const STORE_URL = 'https://store.steampowered.com/';
export const COMMUNITY_URL = 'https://steamcommunity.com/';
export const API_URL = 'https://api.steampowered.com/';
/** store pages' pictures, screenshots and description images */
export const ASSETS_URL =
  'https://shared.fastly.steamstatic.com/store_item_assets/';
/** pictures of group posts and sale pages, by the group's account id */
export const CLAN_IMAGES_URL = 'https://clan.fastly.steamstatic.com/images/';

/** Fetches with a web session's cookie, see `webSession`. */
export function fetchWithCookie(
  url: string,
  cookie: string,
  init: RequestInit = {},
) {
  return fetch(url, {
    ...init,
    headers: { ...init.headers, cookie },
    // with credentials, React Native on iOS sends the cookies it stored instead of this header
    credentials: 'omit',
  });
}

/** GETs JSON, logged in to the website when given a web session's cookie. */
export async function getJson<T>(url: string, cookie?: string) {
  const response = await (cookie ? fetchWithCookie(url, cookie) : fetch(url));
  if (!response.ok) {
    throw new Error(`Steam answered HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

/** Looks a list up in batches of `size` at once, results in the list's order. */
export async function inBatches<T, R>(
  list: T[],
  size: number,
  lookUp: (batch: T[]) => Promise<R[]>,
) {
  const batches = [];
  for (let i = 0; i < list.length; i += size) {
    batches.push(lookUp(list.slice(i, i + size)));
  }
  return (await Promise.all(batches)).flat();
}
