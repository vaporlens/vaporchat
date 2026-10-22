import type { LibraryGame, StoreItem, UserApps } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import { callApi, getGames } from './store.ts';
import { ASSETS_URL, getJson, STORE_URL } from './web.ts';

/** A game of the user's library as GetOwnedGames describes it, only what we use. */
export interface OwnedGame {
  appid: number;
  name?: string;
  /** seconds, 0 when never played */
  rtime_last_played?: number;
  /** minutes */
  playtime_forever?: number;
  playtime_2weeks?: number;
}

/** A game the user's Steam Family lends them, as GetSharedLibraryApps describes it. */
export interface SharedApp {
  appid: number;
  name?: string;
}

/**
 * The games as store items without prices, they're the user's already, with how much they were
 * played. Recently played first, then the never played ones by name, then the family's games by
 * name. Pictures from the games' store items, see `getGames`.
 */
export function libraryItems(
  games: OwnedGame[],
  shared: SharedApp[],
  store: Map<number | null, StoreItem>,
): LibraryGame[] {
  const item = (appid: number, name = '') => ({
    appid,
    includedAppids: [],
    name,
    url: `${STORE_URL}app/${appid}`,
    // newer apps keep theirs under a hashed folder only the store knows, older and delisted
    // ones (which the store doesn't show) have one at this path
    imageUrl:
      store.get(appid)?.imageUrl ??
      `${ASSETS_URL}steam/apps/${appid}/header.jpg`,
    price: null,
    originalPrice: null,
    discountPercent: 0,
    discountEndsAt: null,
    releasedAt: null,
    releaseWindow: null,
    comingSoon: false,
    free: false,
  });
  return [
    ...[...games]
      .sort(
        (a, b) =>
          (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0) ||
          (a.name ?? '').localeCompare(b.name ?? ''),
      )
      .map((game) => ({
        ...item(game.appid, game.name),
        minutesPlayed: game.playtime_forever ?? 0,
        minutesPlayedRecently: game.playtime_2weeks ?? 0,
        lastPlayedAt: game.rtime_last_played
          ? game.rtime_last_played * 1000
          : null,
        familyShared: false,
      })),
    ...[...shared]
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .map((app) => ({
        ...item(app.appid, app.name),
        minutesPlayed: 0,
        minutesPlayedRecently: 0,
        lastPlayedAt: null,
        familyShared: true,
      })),
  ];
}

/** The games the user's Steam Family lends them, none when they're in no family. */
async function getFamilyShared(
  steamid: string,
  accessToken: string,
): Promise<SharedApp[]> {
  const { family_groupid } = await callApi<{ family_groupid?: string }>(
    'IFamilyGroupsService/GetFamilyGroupForUser',
    { steamid },
    accessToken,
  );
  if (!family_groupid) return [];
  // without the user's own games or the ones the family can't lend
  const { apps = [] } = await callApi<{ apps?: SharedApp[] }>(
    'IFamilyGroupsService/GetSharedLibraryApps',
    { family_groupid, steamid, include_own: false, include_excluded: false },
    accessToken,
  );
  return apps;
}

/** The games the user owns, played free games included, with their playtime, then the family's. */
export async function getLibrary(
  steamid: string,
  { accessToken }: WebSession,
  country: string,
): Promise<LibraryGame[]> {
  const [{ games = [] }, shared] = await Promise.all([
    callApi<{ games?: OwnedGame[] }>(
      'IPlayerService/GetOwnedGames',
      { steamid, include_appinfo: true, include_played_free_games: true },
      accessToken,
    ),
    // untested against a family, failing it leaves the user's own games showing
    getFamilyShared(steamid, accessToken).catch((): SharedApp[] => []),
  ]);
  const store = await getGames(
    [...games, ...shared].map((game) => game.appid),
    country,
  );
  return libraryItems(games, shared, store);
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
