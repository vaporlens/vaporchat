import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreItem } from '../protocol.ts';
import { getUserApps, libraryItems } from './library.ts';

describe('libraryItems', () => {
  it('has recently played games first, then never played ones by name', () => {
    const items = libraryItems(
      [
        { appid: 1, name: 'Zeta', rtime_last_played: 0 },
        { appid: 2, name: 'Old', rtime_last_played: 100 },
        { appid: 3, name: 'Alpha' },
        { appid: 4, name: 'Recent', rtime_last_played: 200 },
      ],
      [],
      new Map(),
    );
    expect(items.map((item) => item.name)).toEqual([
      'Recent',
      'Old',
      'Alpha',
      'Zeta',
    ]);
  });

  it('says how long and when each game was played, nothing for never played ones', () => {
    const [played, never] = libraryItems(
      [
        {
          appid: 1,
          name: 'Played',
          rtime_last_played: 1_700_000_000,
          playtime_forever: 600,
          playtime_2weeks: 90,
        },
        { appid: 2, name: 'Never', rtime_last_played: 0 },
      ],
      [],
      new Map(),
    );
    expect(played).toMatchObject({
      minutesPlayed: 600,
      minutesPlayedRecently: 90,
      lastPlayedAt: 1_700_000_000_000,
    });
    expect(never).toMatchObject({
      minutesPlayed: 0,
      minutesPlayedRecently: 0,
      lastPlayedAt: null,
    });
  });

  it("has the family's games last, by name, marked as shared and with no playtime", () => {
    const items = libraryItems(
      [{ appid: 1, name: 'Own', playtime_forever: 60 }],
      [
        { appid: 3, name: 'Zeta' },
        { appid: 2, name: 'Alpha' },
      ],
      new Map(),
    );
    expect(
      items.map(({ name, familyShared, minutesPlayed }) => ({
        name,
        familyShared,
        minutesPlayed,
      })),
    ).toEqual([
      { name: 'Own', familyShared: false, minutesPlayed: 60 },
      { name: 'Alpha', familyShared: true, minutesPlayed: 0 },
      { name: 'Zeta', familyShared: true, minutesPlayed: 0 },
    ]);
  });

  it("uses the store's picture, the old path for games the store doesn't show", () => {
    const shown = {
      imageUrl: 'https://cdn/apps/1/hash/header.jpg',
    } as StoreItem;
    const items = libraryItems(
      [
        { appid: 1, name: 'New' },
        { appid: 2, name: 'Old' },
      ],
      [],
      new Map([[1, shown]]),
    );
    expect(items.map((item) => item.imageUrl)).toEqual([
      'https://cdn/apps/1/hash/header.jpg',
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2/header.jpg',
    ]);
  });
});

describe('getUserApps', () => {
  const SESSION = {
    sessionid: 'abc',
    cookie: 'sessionid=abc',
    accessToken: 'x',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails on the empty lists steam answers a session it doesn't know with", async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ rgOwnedApps: [], rgWishlist: [] }),
    );
    await expect(getUserApps(SESSION)).rejects.toThrow();
  });
});
