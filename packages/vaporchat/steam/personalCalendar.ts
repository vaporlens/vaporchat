import type { WebSession } from './logOn.ts';
import { getStoreItems } from './store.ts';
import { getJson, STORE_URL } from './web.ts';

// today and the next two
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

/** The user's Personal Calendar of the next few days: releases Steam picked for them. */
export async function getPersonalCalendar(
  { cookie }: WebSession,
  country: string,
) {
  // its answer has releases of days around the ones asked too
  const { arrAppInfos = [] } = await getJson<{ arrAppInfos?: CalendarApp[] }>(
    `${STORE_URL}personalcalendardata?tag=0&days_backward=0&days_forward=${DAYS}`,
    cookie,
  );
  const apps = releasesByDay(arrAppInfos, Date.now(), DAYS);
  const items = await getStoreItems(
    apps.map((app) => app.nAppID),
    country,
  );
  // the calendar's date, the store has an early access game's first release instead
  const releases = new Map(
    apps.map((app) => [app.nAppID, app.nReleaseDate * 1000]),
  );
  return items.map((item) => ({
    ...item,
    releasedAt: releases.get(item.appid ?? 0) ?? item.releasedAt,
  }));
}
