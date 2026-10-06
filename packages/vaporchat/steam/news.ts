import type { FeedPage, SteamEvent } from '../protocol.ts';
import { getEvents, toSteamEvent } from './events.ts';
import type { WebSession } from './logOn.ts';
import { getGames } from './store.ts';
import { getJson, STORE_URL } from './web.ts';

// the News Hub's own timeline, logged in it knows which games are the user's
const CALENDAR_URL = `${STORE_URL}events/ajaxgetusereventcalendarrange/`;
// the News Hub's default kinds: news, updates, events, streams, releases, sales
const EVENT_TYPES =
  '28,9,27,22,23,24,35,25,26,11,12,13,14,10,29,16,15,32,20,21,31,34';
const PAGE_SIZE = 250;
// most of the timeline is featured news for everyone, a page may have none of the user's
const MAX_REQUESTS = 4;
const MIN_ITEMS = 10;

// why an app or group is in the timeline, a bitmask
const SOURCE_LIBRARY = 1;
const SOURCE_WISHLIST = 2;
const SOURCE_FOLLOWING = 4;
const SOURCE_STEAM = 16;
const SOURCE_REQUIRED = 32;
const SOURCE_REPOSTED = 256;
/** what the News Hub's "Your News" shows, featured and recommended news is left out */
const YOURS =
  SOURCE_LIBRARY |
  SOURCE_WISHLIST |
  SOURCE_FOLLOWING |
  SOURCE_STEAM |
  SOURCE_REQUIRED |
  SOURCE_REPOSTED;

interface Calendar {
  backwardComplete?: boolean;
  documents?: Document[];
  apps?: { appid: number; source: number }[];
  clans?: { clanid: number; source: number }[];
}

/** A post in the timeline, without its text. */
interface Document {
  clanid: number;
  unique_id: string;
  appid?: number;
  start_time: number;
}

/** The user's own posts in a timeline page, newest first. */
export function yourDocuments({
  documents = [],
  apps = [],
  clans = [],
}: Calendar) {
  const appSources = new Map(apps.map((app) => [app.appid, app.source]));
  const clanSources = new Map(clans.map((clan) => [clan.clanid, clan.source]));
  return documents.filter(({ appid, clanid }) => {
    const source = appid ? appSources.get(appid) : clanSources.get(clanid);
    return ((source ?? 0) & YOURS) !== 0;
  });
}

/**
 * News, updates and events of the games the user owns, wishlisted or follows, like the
 * News Hub's "Your News". `before` is the `next` of the previous page.
 */
export async function getYourNews(
  { cookie }: WebSession,
  country: string,
  before: number | null,
): Promise<FeedPage<SteamEvent>> {
  const documents: Document[] = [];
  let next = before ?? Math.floor(Date.now() / 1000);
  let complete = false;
  for (
    let i = 0;
    i < MAX_REQUESTS && !complete && documents.length < MIN_ITEMS;
    i++
  ) {
    // the posts' texts are fetched for the user's posts only, most of a page is someone else's
    const calendar = await getJson<Calendar>(
      `${CALENDAR_URL}?minTime=0&maxTime=${next}&ascending=false&maxResults=${PAGE_SIZE}` +
        `&populateEvents=0&eventTypes=${EVENT_TYPES}&l=english`,
      cookie,
    );
    documents.push(...yourDocuments(calendar));
    const times = (calendar.documents ?? []).map((doc) => doc.start_time);
    complete = calendar.backwardComplete === true || times.length === 0;
    next = Math.min(...times) - 1;
  }
  // the game's name, and its picture for posts without one
  const appids = [...new Set(documents.flatMap(({ appid }) => appid || []))];
  const [events, games] = await Promise.all([
    getEvents(documents.map(({ unique_id }) => unique_id)),
    getGames(appids, country),
  ]);
  const byId = new Map(events.map((event) => [event.gid, event]));
  return {
    items: documents.flatMap(({ unique_id }) => {
      const found = byId.get(unique_id);
      if (!found) return [];
      // english like the post's body, which is only fetched in english
      const event = toSteamEvent(found, 0);
      const game = event.appid ? games.get(event.appid) : undefined;
      return [
        {
          ...event,
          game: game?.name ?? null,
          imageUrl: event.imageUrl ?? game?.imageUrl ?? null,
        },
      ];
    }),
    next: complete ? null : next,
  };
}
