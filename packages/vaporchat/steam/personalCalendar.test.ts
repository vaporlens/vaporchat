import { describe, expect, it } from 'vitest';
import { type CalendarApp, releasesByDay } from './personalCalendar.ts';

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
