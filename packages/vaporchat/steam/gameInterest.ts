import type { GameInterest } from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import type { WebSession } from './logOn.ts';
import { fetchWithCookie, STORE_URL } from './web.ts';

/** What the store page's buttons post, for marking and unmarking a game. */
const FORMS = {
  wishlisted: (on: boolean) => ({
    path: on ? 'api/addtowishlist' : 'api/removefromwishlist',
    fields: {},
  }),
  following: (on: boolean) => ({
    path: 'explore/followgame/',
    fields: on ? {} : { unfollow: 1 },
  }),
  ignored: (on: boolean) => ({
    path: 'recommended/ignorerecommendation/',
    fields: { remove: on ? 0 : 1 },
  }),
  // the store's ERecommendationIgnoreReason "played on another platform"
  playedElsewhere: (on: boolean) => ({
    path: 'recommended/ignorerecommendation/',
    fields: on ? { remove: 0, ignore_reason: 2 } : { remove: 1 },
  }),
};

/** Whether the user owns, wishlisted, follows or ignored a game. */
export async function getGameInterest(
  cm: SteamCM,
  appid: number,
): Promise<GameInterest> {
  const state = await cm.call<{
    owned?: boolean;
    wishlist?: boolean;
    following?: boolean;
    ignored?: boolean;
    ignored_reason?: number;
  }>('Store.GetUserGameInterestState#1', { appid });
  return {
    owned: state.owned ?? false,
    wishlisted: state.wishlist ?? false,
    following: state.following ?? false,
    ignored: state.ignored ?? false,
    playedElsewhere: (state.ignored ?? false) && state.ignored_reason === 2,
  };
}

/**
 * Wishlists, follows or ignores a game (`on`), or takes that back, like its store page's buttons.
 * Ignoring it as played elsewhere is ignoring it too.
 */
export async function setGameInterest(
  { sessionid, cookie }: WebSession,
  appid: number,
  interest: Exclude<keyof GameInterest, 'owned'>,
  on: boolean,
) {
  const { path, fields } = FORMS[interest](on);
  const form = new FormData();
  for (const [name, value] of Object.entries({ sessionid, appid, ...fields })) {
    form.append(name, String(value));
  }
  const response = await fetchWithCookie(STORE_URL + path, cookie, {
    method: 'POST',
    body: form,
  });
  // refused, it answers with an HTTP error or `{"success":false}`, the wishlist with HTTP 200
  const refused =
    !response.ok ||
    ((await response.json()) as { success?: boolean } | null)?.success ===
      false;
  if (refused) throw new Error('Steam did not save that, try again later');
}
