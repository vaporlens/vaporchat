import type {
  FeedPage,
  FriendActivity,
  FriendActivityKind,
  StoreItem,
} from '../protocol.ts';
import type { SteamCM } from './cm.ts';
import { getGames } from './store.ts';
import { COMMUNITY_URL, STORE_URL } from './web.ts';

const PAGE_SIZE = 50;
const ACHIEVEMENT_ICONS_URL =
  'https://shared.fastly.steamstatic.com/community_assets/images/apps/';

// EUserNewsType values worth showing, status changes and group announcements are left out
const KINDS: Record<number, FriendActivityKind> = {
  1: 'friendAdded',
  2: 'achievement',
  3: 'purchase',
  9: 'wishlist',
  10: 'review',
  13: 'screenshot',
  14: 'video',
  15: 'workshop',
  23: 'favorited',
  30: 'firstPlay',
};

interface UserNews {
  news?: {
    eventtype?: number;
    eventtime?: number;
    steamid_actor?: string;
    steamid_target?: string;
    gameid?: string;
    achievement_names?: string[];
    publishedfileid?: string;
    /** the apps of a purchased package */
    appids?: number[];
  }[];
  achievement_display_data?: {
    appid?: number;
    achievements?: {
      name?: string;
      display_name?: string;
      display_description?: string;
      icon?: string;
    }[];
  }[];
}

type NewsEvent = NonNullable<UserNews['news']>[number];

/** The app an event is about, 0 for none. */
function appOf(event: NewsEvent) {
  return event.appids?.[0] ?? Number(event.gameid ?? 0);
}

function linkTo(kind: FriendActivityKind, event: NewsEvent, appid: number) {
  const actor = `${COMMUNITY_URL}profiles/${event.steamid_actor}/`;
  switch (kind) {
    case 'friendAdded':
      return `${COMMUNITY_URL}profiles/${event.steamid_target}/`;
    case 'achievement':
      return `${actor}stats/${appid}/achievements/`;
    case 'review':
      return `${actor}recommended/${appid}/`;
    case 'screenshot':
    case 'video':
    case 'workshop':
    case 'favorited':
      return `${COMMUNITY_URL}sharedfiles/filedetails/?id=${event.publishedfileid}`;
    default:
      return `${STORE_URL}app/${appid}/`;
  }
}

/** Turns Steam's events into activities, `games` has the store items of their apps. */
export function toFriendActivities(
  { news = [], achievement_display_data = [] }: UserNews,
  games: Map<number | null, StoreItem>,
): FriendActivity[] {
  return news.flatMap((event, index): FriendActivity[] => {
    const kind = KINDS[event.eventtype ?? 0];
    if (!kind || !event.steamid_actor) return [];
    const appid = appOf(event);
    const unlocked = new Set(event.achievement_names ?? []);
    const achievements = (
      achievement_display_data.find((data) => data.appid === appid)
        ?.achievements ?? []
    )
      .filter(({ name }) => name && unlocked.has(name))
      .map(({ display_name, display_description, icon }) => ({
        name: display_name ?? '',
        description: display_description ?? '',
        iconUrl: icon ? `${ACHIEVEMENT_ICONS_URL}${appid}/${icon}` : null,
      }));
    return [
      {
        // nothing in an event is unique, two can share actor, kind and second
        id: `${event.eventtime}-${index}-${event.steamid_actor}-${kind}`,
        kind,
        time: (event.eventtime ?? 0) * 1000,
        actor: event.steamid_actor,
        target: kind === 'friendAdded' ? (event.steamid_target ?? null) : null,
        game: games.get(appid) ?? null,
        achievements,
        url: linkTo(kind, event, appid),
      },
    ];
  });
}

/** What friends did lately, newest first. `before` is the `next` of the previous page. */
export async function getFriendsActivity(
  cm: SteamCM,
  country: string,
  before: number | null,
): Promise<FeedPage<FriendActivity>> {
  const response = await cm.call<UserNews>('UserNews.GetUserNews#1', {
    count: PAGE_SIZE,
    starttime: 0,
    endtime: before ?? Math.floor(Date.now() / 1000),
    language: 'english',
  });
  const news = response.news ?? [];
  const appids = [...new Set(news.map(appOf).filter((appid) => appid > 0))];
  const games = await getGames(appids, country);
  const times = news.map(({ eventtime = 0 }) => eventtime);
  return {
    items: toFriendActivities(response, games),
    next: times.length > 0 ? Math.min(...times) - 1 : null,
  };
}
