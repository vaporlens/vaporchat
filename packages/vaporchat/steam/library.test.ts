import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUserApps, libraryItems } from './library.ts';

describe('libraryItems', () => {
  it('has recently played games first, then never played ones by name', () => {
    const items = libraryItems([
      { appid: 1, name: 'Zeta', rtime_last_played: 0 },
      { appid: 2, name: 'Old', rtime_last_played: 100 },
      { appid: 3, name: 'Alpha' },
      { appid: 4, name: 'Recent', rtime_last_played: 200 },
    ]);
    expect(items.map((item) => item.name)).toEqual([
      'Recent',
      'Old',
      'Alpha',
      'Zeta',
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
