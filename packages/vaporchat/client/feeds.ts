import type { Deals } from '../protocol.ts';
import type { SteamCM } from '../steam/cm.ts';
import { getLiveSaleEvents } from '../steam/events.ts';
import { getFriendsActivity } from '../steam/friendsActivity.ts';
import { getGameDetails } from '../steam/gameDetails.ts';
import type { WebSession } from '../steam/logOn.ts';
import { getYourNews } from '../steam/news.ts';
import { getSalePage } from '../steam/salePage.ts';
import { getNewReleases, getSpecials } from '../steam/store.ts';

/**
 * What Steam's store and client show: deals, new releases, game and sale pages, news and
 * friends' activity. Store pages go through store.steampowered.com, which browsers can't reach
 * without a proxy (no CORS). Prices are in the currency of where Steam located us at logon.
 */
export class SteamFeeds {
  #cm: SteamCM;
  #webSession: () => Promise<WebSession>;

  constructor(cm: SteamCM, webSession: () => Promise<WebSession>) {
    this.#cm = cm;
    this.#webSession = webSession;
  }

  /** The sale events running now and the store's top discounts. */
  async getDeals(): Promise<Deals> {
    const [events, specials] = await Promise.all([
      getLiveSaleEvents(),
      getSpecials(this.#cm.country),
    ]);
    return { events, specials };
  }

  /** Popular new releases, newest first. */
  getNewReleases() {
    return getNewReleases(this.#cm.country);
  }

  /** A game's store page: descriptions, screenshots, reviews and tags. */
  getGame(appid: number) {
    return getGameDetails(appid, this.#cm.country);
  }

  /** The texts and game lists of a sale event's page, by the event's `id`. */
  getSalePage(eventId: string) {
    return getSalePage(eventId, this.#cm.country);
  }

  /** News of the user's games (owned, wishlisted, followed), like the News Hub's "Your News". */
  async getNews(before: number | null = null) {
    return getYourNews(await this.#webSession(), this.#cm.country, before);
  }

  /** What friends did lately: achievements, purchases, screenshots, reviews. */
  getFriendsActivity(before: number | null = null) {
    return getFriendsActivity(this.#cm, this.#cm.country, before);
  }
}
