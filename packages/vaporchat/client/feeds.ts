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
  /** waited for, the feeds can be asked for while logging on */
  #cm: Promise<SteamCM>;
  #webSession: () => Promise<WebSession>;
  /** steam's language id that sale events are in */
  #language: number;

  constructor(
    cm: Promise<SteamCM>,
    webSession: () => Promise<WebSession>,
    language: number,
  ) {
    this.#cm = cm;
    this.#webSession = webSession;
    this.#language = language;
  }

  /** where Steam located us at logon, the store's prices follow it */
  async #country() {
    return (await this.#cm).country;
  }

  /** The sale events running now. */
  getSaleEvents() {
    return getLiveSaleEvents(this.#language);
  }

  /** The store's top discounts. */
  async getSpecials() {
    return getSpecials(await this.#country());
  }

  /** The store's top sellers, best selling first. */
  async getTopSellers() {
    return getTopSellers(await this.#country());
  }

  /** A page of the user's wishlist, biggest discounts first. */
  async getWishlist(start: number | null = null) {
    const cm = await this.#cm;
    return getWishlist(cm.steamid, await this.#webSession(), cm.country, start);
  }

  /** Popular new releases, newest first. */
  async getNewReleases() {
    return getNewReleases(await this.#country());
  }

  /** Popular games coming soon. */
  async getUpcoming() {
    return getUpcoming(await this.#country());
  }

  /** Releases of the next few days Steam picked for the user, like the store's Personal Calendar. */
  async getPersonalCalendar() {
    return getPersonalCalendar(await this.#webSession(), await this.#country());
  }

  /** Games by appid, in the order asked, a bundle's `includedAppids` say. */
  async getStoreItems(appids: number[]) {
    return getStoreItems(appids, await this.#country());
  }

  /** A game's store page: descriptions, screenshots, reviews and tags. */
  async getGame(appid: number) {
    return getGameDetails(appid, await this.#country());
  }

  /** The texts and game lists of a sale event's page, by the event's `id`. */
  async getSalePage(eventId: string) {
    return getSalePage(eventId, await this.#country(), this.#language);
  }

  /** News of the user's games (owned, wishlisted, followed), like the News Hub's "Your News". */
  async getNews(before: number | null = null) {
    return getYourNews(await this.#webSession(), await this.#country(), before);
  }

  /** What friends did lately: achievements, purchases, screenshots, reviews. */
  async getFriendsActivity(before: number | null = null) {
    const cm = await this.#cm;
    return getFriendsActivity(cm, cm.country, before);
  }
}
