import type { SteamCM } from '../steam/cm.ts';
import { getLiveSaleEvents } from '../steam/events.ts';
import { getFriendsActivity } from '../steam/friendsActivity.ts';
import { getGameDetails } from '../steam/gameDetails.ts';
import type { WebSession } from '../steam/logOn.ts';
import { getYourNews } from '../steam/news.ts';
import { getPersonalCalendar } from '../steam/personalCalendar.ts';
import { getSalePage } from '../steam/salePage.ts';
import {
  getNewReleases,
  getSpecials,
  getStoreItems,
  getTopSellers,
  getUpcoming,
} from '../steam/store.ts';
import { getWishlist } from '../steam/wishlist.ts';

/**
 * What Steam's store and client show: sale events, deals, top sellers, the user's wishlist, new
 * and upcoming games, personal release calendar, game and sale pages, news and friends'
 * activity. Store pages go through store.steampowered.com, which browsers can't reach without a
 * proxy (no CORS). Prices are in the currency of where Steam located us at logon.
 */
export class SteamFeeds {
  #cm: SteamCM;
  #webSession: () => Promise<WebSession>;

  constructor(cm: SteamCM, webSession: () => Promise<WebSession>) {
    this.#cm = cm;
    this.#webSession = webSession;
  }

  /** The sale events running now. */
  getSaleEvents() {
    return getLiveSaleEvents();
  }

  /** The store's top discounts. */
  getSpecials() {
    return getSpecials(this.#cm.country);
  }

  /** The store's top sellers, best selling first. */
  getTopSellers() {
    return getTopSellers(this.#cm.country);
  }

  /** A page of the user's wishlist, biggest discounts first. */
  async getWishlist(start: number | null = null) {
    return getWishlist(
      this.#cm.steamid,
      await this.#webSession(),
      this.#cm.country,
      start,
    );
  }

  /** Popular new releases, newest first. */
  getNewReleases() {
    return getNewReleases(this.#cm.country);
  }

  /** Popular games coming soon. */
  getUpcoming() {
    return getUpcoming(this.#cm.country);
  }

  /** Releases of the next few days Steam picked for the user, like the store's Personal Calendar. */
  async getPersonalCalendar() {
    return getPersonalCalendar(await this.#webSession(), this.#cm.country);
  }

  /** Games by appid, in the order asked, a bundle's `includedAppids` say. */
  getStoreItems(appids: number[]) {
    return getStoreItems(appids, this.#cm.country);
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
