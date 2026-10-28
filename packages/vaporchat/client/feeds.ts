import type {
  CommentThread,
  GameInterest,
  NewsSource,
  SpecialsFilter,
  StoreBrowse,
  StoreRef,
} from '../protocol.ts';
import type { SteamCM } from '../steam/cm.ts';
import { getComments } from '../steam/comments.ts';
import { getGameNews, getLiveSaleEvents } from '../steam/events.ts';
import { getFriendsActivity } from '../steam/friendsActivity.ts';
import {
  getCurrentPlayers,
  getGameDetails,
  getSimilarGames,
} from '../steam/gameDetails.ts';
import { getGameInterest, setGameInterest } from '../steam/gameInterest.ts';
import { steamLanguage } from '../steam/language.ts';
import { getLibrary, getUserApps } from '../steam/library.ts';
import type { WebSession } from '../steam/logOn.ts';
import { getYourNews } from '../steam/news.ts';
import { getMutedSources, setSourceMuted } from '../steam/newsMutes.ts';
import { getPersonalCalendar } from '../steam/personalCalendar.ts';
import { getGameReviews, getReviewHistogram } from '../steam/reviews.ts';
import { getSalePage } from '../steam/salePage.ts';
import {
  browseGames,
  fetchStoreItems,
  getNewReleases,
  getPopularTags,
  getSpecials,
  getStoreCountry,
  getStoreItems,
  getTopSellers,
  getUpcoming,
  searchGames,
  toStoreItem,
} from '../steam/store.ts';
import { getWishlist, getWishlistCategories } from '../steam/wishlist.ts';

/** Who the feeds load the user's own lists for, see `SteamFeeds.anonymous` for no one. */
interface FeedsUser {
  /** waited for, the feeds can be asked for while logging on */
  cm: Promise<SteamCM>;
  webSession: () => Promise<WebSession>;
}

/**
 * What Steam's store and client show: sale events, deals, top sellers, the user's wishlist and
 * library, new and upcoming games, personal release calendar, game and sale pages, news and
 * friends' activity. Store pages go through store.steampowered.com, which browsers can't reach
 * without a proxy (no CORS). Prices are in the currency of where Steam located us.
 */
export class SteamFeeds {
  /** steam's language id that sale events are in */
  #language: number;
  #user: FeedsUser | null;
  /** without a user, where the store located us */
  #located: Promise<string> | null = null;

  constructor(language: number, user: FeedsUser | null) {
    this.#language = language;
    this.#user = user;
  }

  /**
   * The feeds anyone sees, without logging on: the store's lists, game and sale pages and sale
   * events, and the news Steam features for everyone. The user's own lists and friends'
   * activity reject.
   */
  static anonymous(locale = 'en') {
    return new SteamFeeds(steamLanguage(locale), null);
  }

  /** where Steam located us (at logon with a user), the store's prices follow it */
  async #country() {
    if (this.#user) return (await this.#user.cm).country;
    this.#located ??= getStoreCountry().catch((err: Error) => {
      // asked again next time
      this.#located = null;
      throw err;
    });
    return this.#located;
  }

  /** for the user's own lists */
  #requireUser() {
    if (!this.#user) throw new Error('Sign in to Steam to see this');
    return this.#user;
  }

  #webSession() {
    return this.#requireUser().webSession();
  }

  /** The sale events running now. */
  getSaleEvents() {
    return getLiveSaleEvents(this.#language);
  }

  /** A page of the store's discounted games, only those `filter` lets through. */
  async getSpecials(start: number | null = null, filter?: SpecialsFilter) {
    return getSpecials(await this.#country(), start, filter);
  }

  /** A page of the store's top sellers, best selling first. */
  async getTopSellers(start: number | null = null) {
    return getTopSellers(await this.#country(), start);
  }

  /** A page of the user's wishlist, biggest discounts first, only `categoryId`'s with one. */
  async getWishlist(
    start: number | null = null,
    categoryId: string | null = null,
  ) {
    const cm = await this.#requireUser().cm;
    return getWishlist(
      cm.steamid,
      await this.#webSession(),
      cm.country,
      start,
      categoryId,
    );
  }

  /** The categories the user sorts their wishlist into. */
  async getWishlistCategories() {
    return getWishlistCategories(await this.#webSession());
  }

  /** The games and groups whose news the user muted. */
  async getMutedNewsSources() {
    return getMutedSources(await this.#webSession());
  }

  /** Mutes a game's or group's news in the user's feed, or unmutes it. */
  async setNewsSourceMuted(
    source: Pick<NewsSource, 'kind' | 'id'>,
    muted: boolean,
  ) {
    return setSourceMuted(await this.#webSession(), source, muted);
  }

  /** The games the user owns with their playtime, recently played first. */
  async getLibrary() {
    const cm = await this.#requireUser().cm;
    return getLibrary(cm.steamid, await this.#webSession(), cm.country);
  }

  /** The apps the user owns and wishlisted, to mark them in other lists. */
  async getUserApps() {
    return getUserApps(await this.#webSession());
  }

  /** A page of popular new releases, newest first. */
  async getNewReleases(start: number | null = null) {
    return getNewReleases(await this.#country(), start);
  }

  /** A page of what the store finds for `term`, best matches first. */
  async searchGames(term: string, start: number | null = null) {
    return searchGames(term, await this.#country(), start);
  }

  /** A page of a hub's or tag's games, most popular first, or those found for `term`. */
  async browseGames(
    browse: StoreBrowse,
    start: number | null = null,
    term = '',
  ) {
    return browseGames(browse, await this.#country(), start, term);
  }

  /** The store's tags to browse by, the most used first. */
  getPopularTags() {
    return getPopularTags();
  }

  /** A page of popular games coming soon. */
  async getUpcoming(start: number | null = null) {
    return getUpcoming(await this.#country(), start);
  }

  /** A few days of releases Steam picked for the user, like the store's Personal Calendar. */
  async getPersonalCalendar(start: number | null = null) {
    return getPersonalCalendar(
      await this.#webSession(),
      await this.#country(),
      start,
    );
  }

  /** Games by appid, in the order asked, a bundle's `includedAppids` say. */
  async getStoreItems(appids: number[]) {
    return getStoreItems(appids, await this.#country());
  }

  /** Store items in the order asked, a game's `editions` say. */
  async getStoreItemsByRef(refs: StoreRef[]) {
    return (await fetchStoreItems(refs, await this.#country())).map(
      toStoreItem,
    );
  }

  /** A game's store page: descriptions, screenshots, reviews, tags, features, editions, requirements. */
  async getGame(appid: number) {
    return getGameDetails(appid, await this.#country());
  }

  /** How many play a game now, null for games Steam has no count for. */
  getCurrentPlayers(appid: number) {
    return getCurrentPlayers(appid);
  }

  /** Games like this one, the store page's "More like this". */
  async getSimilarGames(appid: number) {
    return getSimilarGames(appid, await this.#country());
  }

  /** Whether the user owns, wishlisted, follows or ignored a game. */
  async getGameInterest(appid: number) {
    return getGameInterest(await this.#requireUser().cm, appid);
  }

  /**
   * Wishlists, follows or ignores a game (`on`), or takes that back. Then what Steam has now,
   * one change can bring others along.
   */
  async setGameInterest(
    appid: number,
    interest: Exclude<keyof GameInterest, 'owned'>,
    on: boolean,
  ) {
    await setGameInterest(await this.#webSession(), appid, interest, on);
    return this.getGameInterest(appid);
  }

  /** A page of a game's reviews, most helpful first. */
  getGameReviews(appid: number, cursor: string | null = null) {
    return getGameReviews(appid, cursor);
  }

  /** A game's reviews over time: since its release, and the last 30 days. */
  getReviewHistogram(appid: number) {
    return getReviewHistogram(appid);
  }

  /** A page of a news post's comments, newest first. */
  getComments(thread: CommentThread, start: number | null = null) {
    return getComments(thread, start);
  }

  /** A page of a game's news, newest first. */
  getGameNews(appid: number, offset: number | null = null) {
    return getGameNews(appid, offset);
  }

  /** The texts and game lists of a sale event's page, by the event's `id`. */
  async getSalePage(eventId: string) {
    return getSalePage(eventId, await this.#country(), this.#language);
  }

  /**
   * News of the user's games (owned, wishlisted, followed), like the News Hub's "Your News".
   * Without a user, the news Steam features for everyone.
   */
  async getNews(before: number | null = null) {
    const session = this.#user ? await this.#webSession() : null;
    return getYourNews(session, await this.#country(), before);
  }

  /** What friends did lately: achievements, purchases, screenshots, reviews. */
  async getFriendsActivity(before: number | null = null) {
    const cm = await this.#requireUser().cm;
    return getFriendsActivity(cm, cm.country, before);
  }
}
