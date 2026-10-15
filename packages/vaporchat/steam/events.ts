import type { FeedPage, SteamEvent } from '../protocol.ts';
import { localized } from './language.ts';
import { parseRichText, plainText } from './richText.ts';
import { CLAN_IMAGES_URL, getJson, inBatches, STORE_URL } from './web.ts';

// sale pages, game news and announcements are all "partner events" on the store
// a clan's SteamID64 minus this is its account id, which its image and page URLs use
const CLAN_STEAMID_BASE = 103582791429521408n;
// ajaxgetbatchedpartnerevent takes up to this many ids per request
const BATCH_SIZE = 100;
const SUMMARY_LENGTH = 240;
const NEWS_PAGE_SIZE = 20;

/** An event as the store's ajax endpoints describe it, only what we use. */
export interface ApiEvent {
  gid: string;
  clan_steamid: string;
  appid?: number | string;
  event_name?: string;
  rtime32_start_time?: number;
  rtime32_end_time?: number;
  /** JSON of its sale page, pictures and summary */
  jsondata?: string;
  announcement_body?: { body?: string };
}

interface EventJson {
  /** per language, english first, entries can be null */
  localized_capsule_image?: (string | null)[];
  localized_summary?: (string | null)[];
  sale_vanity_id?: string;
  sale_vanity_id_valve_approved_for_sale_subpath?: boolean;
}

function parseJson(jsondata: string | undefined): EventJson {
  try {
    return jsondata ? (JSON.parse(jsondata) as EventJson) : {};
  } catch {
    return {};
  }
}

/** `language` is Steam's language id for the texts and pictures that have one. */
export function toSteamEvent(event: ApiEvent, language: number): SteamEvent {
  const json = parseJson(event.jsondata);
  const clan = String(BigInt(event.clan_steamid) - CLAN_STEAMID_BASE);
  const appid = Number(event.appid) || null;
  const capsule = localized(json.localized_capsule_image, language);
  const vanity = json.sale_vanity_id;
  // like the store's own links: unapproved sale paths only work under the curator
  const url = vanity
    ? json.sale_vanity_id_valve_approved_for_sale_subpath
      ? `${STORE_URL}sale/${vanity}`
      : `${STORE_URL}curator/${clan}/sale/${vanity}`
    : appid
      ? `${STORE_URL}news/app/${appid}/view/${event.gid}`
      : `${STORE_URL}news/group/${clan}/view/${event.gid}`;
  const body = parseRichText(event.announcement_body?.body ?? '', appid);
  const summary =
    localized(json.localized_summary, language) ?? plainText(body);
  return {
    id: event.gid,
    title: event.event_name ?? '',
    appid,
    game: null,
    imageUrl: capsule ? `${CLAN_IMAGES_URL}${clan}/${capsule}` : null,
    summary: summary.slice(0, SUMMARY_LENGTH),
    body,
    url,
    startsAt: (event.rtime32_start_time ?? 0) * 1000,
    endsAt: event.rtime32_end_time ? event.rtime32_end_time * 1000 : null,
  };
}

/** Events by id, with their pictures and text. Ids Steam doesn't know are left out. */
export function getEvents(gids: string[]): Promise<ApiEvent[]> {
  return inBatches(gids, BATCH_SIZE, async (ids) => {
    const { events = [] } = await getJson<{ events?: ApiEvent[] }>(
      `${STORE_URL}events/ajaxgetbatchedpartnerevent/?event_gids=${ids.join(',')}&lang_list=0`,
    );
    return events;
  });
}

/** The sales publishers, franchises and festivals are running now, in Steam's `language`. */
export async function getLiveSaleEvents(language: number) {
  const { recent_events = [] } = await getJson<{
    recent_events?: { gid: string }[];
  }>(`${STORE_URL}saleaction/ajaxgetlivesaleevents?l=english`);
  const events = await getEvents(recent_events.map(({ gid }) => gid));
  return events.map((event) => toSteamEvent(event, language));
}

/**
 * A page of a game's news, updates and events, newest first like its store page's news. In
 * English, `offset` is the `next` of the previous page.
 */
export async function getGameNews(
  appid: number,
  offset: number | null,
): Promise<FeedPage<SteamEvent>> {
  const start = offset ?? 0;
  const { events = [] } = await getJson<{ events?: ApiEvent[] }>(
    `${STORE_URL}events/ajaxgetpartnereventspageable/?clan_accountid=0&appid=${appid}` +
      `&offset=${start}&count=${NEWS_PAGE_SIZE}&l=english`,
  );
  return {
    items: events.map((event) => toSteamEvent(event, 0)),
    next: events.length > 0 ? start + events.length : null,
  };
}
