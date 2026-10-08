import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CalendarApp,
  getPersonalCalendar,
  releasesByDay,
} from './personalCalendar.ts';

function app(
  nAppID: number,
  release: Date,
  nRank: number,
  bIsWishlisted = false,
): CalendarApp {
  return {
    nAppID,
    nReleaseDate: release.getTime() / 1000,
    nRank,
    bIsWishlisted,
  };
}

describe('releasesByDay', () => {
  const now = new Date(2026, 9, 6, 15).getTime();

  it('keeps the days asked, from the start of today', () => {
    const apps = [
      app(1, new Date(2026, 9, 5, 23), 1),
      app(2, new Date(2026, 9, 6, 1), 1),
      app(3, new Date(2026, 9, 8, 23), 1),
      app(4, new Date(2026, 9, 9, 0), 1),
    ];
    expect(releasesByDay(apps, now, 3).map((a) => a.nAppID)).toEqual([2, 3]);
  });

  it('orders by day, then wishlisted, then rank', () => {
    const apps = [
      app(1, new Date(2026, 9, 7, 9), 1),
      app(2, new Date(2026, 9, 6, 20), 50),
      app(3, new Date(2026, 9, 6, 10), 9, true),
      app(4, new Date(2026, 9, 6, 12), 5),
    ];
    expect(releasesByDay(apps, now, 3).map((a) => a.nAppID)).toEqual([
      3, 4, 2, 1,
    ]);
  });
});

describe('getPersonalCalendar', () => {
  const SESSION = {
    sessionid: 'abc',
    cookie: 'sessionid=abc',
    accessToken: 'x',
  };

  /** The calendar has `apps` whatever days are asked, like its answer has days around them. */
  function stubCalendar(apps: CalendarApp[]) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 15));
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('personalcalendardata')) {
        return Response.json({ arrAppInfos: apps });
      }
      const input = JSON.parse(
        new URL(url).searchParams.get('input_json') ?? '{}',
      );
      return Response.json({
        response: {
          store_items: input.ids.map(({ appid }: { appid: number }) => ({
            appid,
            success: 1,
          })),
        },
      });
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pages a few days at a time from where the last page ended', async () => {
    stubCalendar([
      app(1, new Date(2026, 9, 7, 12), 1),
      app(2, new Date(2026, 9, 9, 12), 1),
      app(3, new Date(2026, 9, 11, 12), 1),
      app(4, new Date(2026, 9, 12, 12), 1),
    ]);
    const first = await getPersonalCalendar(SESSION, 'US', null);
    const second = await getPersonalCalendar(SESSION, 'US', first.next);
    expect(first.items.map((game) => game.appid)).toEqual([1]);
    expect(second.items.map((game) => game.appid)).toEqual([2, 3]);
  });

  it('ends at days without releases', async () => {
    stubCalendar([app(1, new Date(2026, 9, 7, 12), 1)]);
    const first = await getPersonalCalendar(SESSION, 'US', null);
    const second = await getPersonalCalendar(SESSION, 'US', first.next);
    expect(second.items).toEqual([]);
    expect(second.next).toBeNull();
  });
});
