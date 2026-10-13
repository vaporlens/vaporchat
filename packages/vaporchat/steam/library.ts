import type { StoreItem, UserApps } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import { callApi } from './store.ts';
import { ASSETS_URL, getJson, STORE_URL } from './web.ts';

/** A game of the user's library as GetOwnedGames describes it, only what we use. */
export interface OwnedGame {
  appid: number;
  name?: string;
  /** seconds, 0 when never played */
  rtime_last_played?: number;
}

/**
 * The games as store items without prices, they're the user's already. Recently played first,
 * then the never played ones by name.
 */
export function libraryItems(games: OwnedGame[]): StoreItem[] {
  return [...games]
    .sort(
      (a, b) =>
        (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    )
    .map((game) => ({
      appid: game.appid,
      includedAppids: [],
      name: game.name ?? '',
      url: `${STORE_URL}app/${game.appid}`,
      // every app has one at this path, delisted ones too
      imageUrl: `${ASSETS_URL}steam/apps/${game.appid}/header.jpg`,
      price: null,
      originalPrice: null,
      discountPercent: 0,
      discountEndsAt: null,
      releasedAt: null,
      free: false,
    }));
}

/** The games the user owns, played free games included. */
export async function getLibrary(
  steamid: string,
  { accessToken }: WebSession,
): Promise<StoreItem[]> {
  const { games = [] } = await callApi<{ games?: OwnedGame[] }>(
    'IPlayerService/GetOwnedGames',
    { steamid, include_appinfo: true, include_played_free_games: true },
    accessToken,
  );
  return libraryItems(games);
}

/** The apps the user owns and wishlisted, from what the store's pages mark games with. */
export async function getUserApps({ cookie }: WebSession): Promise<UserApps> {
  const { rgOwnedApps = [], rgWishlist = [] } = await getJson<{
    rgOwnedApps?: number[];
    rgWishlist?: number[];
  }>(`${STORE_URL}dynamicstore/userdata/`, cookie);
  // it answers a session it doesn't know with empty lists, not an error
  if (rgOwnedApps.length === 0 && rgWishlist.length === 0) {
    throw new Error('Steam gave no owned or wishlisted apps');
  }
  return { owned: rgOwnedApps, wishlisted: rgWishlist };
}
