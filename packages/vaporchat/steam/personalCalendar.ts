import type { FeedPage, StoreItem } from '../protocol.ts';
import type { WebSession } from './logOn.ts';
import { getStoreItems } from './store.ts';
import { getJson, STORE_URL } from './web.ts';

// days to a page, the first is today and the next two
const DAYS = 3;

/** A release in the store's Personal Calendar, only what we use. */
export interface CalendarApp {
  nAppID: number;
  /** seconds */
  nReleaseDate: number;
  /** how much Steam thinks it's for the user, 1 most */
  nRank: number;
  bIsWishlisted: boolean;
}

function startOfDay(time: number) {
  return new Date(time).setHours(0, 0, 0, 0);
}

/**
 * The releases of `days` days from `now`'s, by day. Each day's wishlisted games come first,
 * then as Steam ranks them for the user, like the calendar's page.
 */
export function releasesByDay(apps: CalendarApp[], now: number, days: number) {
  const from = startOfDay(now);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  const day = (app: CalendarApp) => startOfDay(app.nReleaseDate * 1000);
  return apps
    .filter(
      (app) =>
        app.nReleaseDate * 1000 >= from &&
        app.nReleaseDate * 1000 < to.getTime(),
    )
    .sort(
      (a, b) =>
        day(a) - day(b) ||
        Number(b.bIsWishlisted) - Number(a.bIsWishlisted) ||
        a.nRank - b.nRank,
    );
}

/**
 * A few days of the user's Personal Calendar: releases Steam picked for them. `start` is the
 * `next` of the previous page, days from today. It ends at the first days without any.
 */
export async function getPersonalCalendar(
  { cookie }: WebSession,
  country: string,
  start: number | null,
): Promise<FeedPage<StoreItem>> {
  const from = start ?? 0;
  const first = new Date();
  first.setDate(first.getDate() + from);
  // its answer has releases of days around the ones asked too, a negative backward starts later
  const { arrAppInfos = [] } = await getJson<{ arrAppInfos?: CalendarApp[] }>(
    `${STORE_URL}personalcalendardata?tag=0&days_backward=${1 - from}&days_forward=${from + DAYS + 1}`,
    cookie,
  );
  const apps = releasesByDay(arrAppInfos, first.getTime(), DAYS);
  const items = await getStoreItems(
    apps.map((app) => app.nAppID),
    country,
  );
  // the calendar's date, the store has an early access game's first release instead
  const releases = new Map(
    apps.map((app) => [app.nAppID, app.nReleaseDate * 1000]),
  );
  return {
    items: items.map((item) => ({
      ...item,
      releasedAt: releases.get(item.appid ?? 0) ?? item.releasedAt,
    })),
    next: apps.length > 0 ? from + DAYS : null,
  };
}
