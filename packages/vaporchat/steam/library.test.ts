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
      new Map(),
    );
    expect(items.map((item) => item.name)).toEqual([
      'Recent',
      'Old',
      'Alpha',
      'Zeta',
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
