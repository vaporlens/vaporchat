import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SteamCM } from './cm.ts';
import { getGameInterest, setGameInterest } from './gameInterest.ts';

const SESSION = {
  sessionid: 'abc',
  cookie: 'steamLoginSecure=x; sessionid=abc',
  accessToken: 'x',
};

/** Answers every request with `answer`, records the requests. */
function stubStore(answer: () => Response) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return answer();
  });
  return requests;
}

describe('setGameInterest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['wishlisted', true, 'api/addtowishlist', {}],
    ['wishlisted', false, 'api/removefromwishlist', {}],
    ['following', true, 'explore/followgame/', {}],
    ['following', false, 'explore/followgame/', { unfollow: '1' }],
    ['ignored', true, 'recommended/ignorerecommendation/', { remove: '0' }],
    ['ignored', false, 'recommended/ignorerecommendation/', { remove: '1' }],
    [
      'playedElsewhere',
      true,
      'recommended/ignorerecommendation/',
      { remove: '0', ignore_reason: '2' },
    ],
    [
      'playedElsewhere',
      false,
      'recommended/ignorerecommendation/',
      { remove: '1' },
    ],
  ] as const)(
    'posts %s=%s like the store page does',
    async (interest, on, path, fields) => {
      const requests = stubStore(() => Response.json({ success: true }));
      await setGameInterest(SESSION, 620, interest, on);

      const [{ url, init }] = requests;
      expect(url).toBe(`https://store.steampowered.com/${path}`);
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ cookie: SESSION.cookie });
      expect(Object.fromEntries(init.body as FormData)).toEqual({
        sessionid: 'abc',
        appid: '620',
        ...fields,
      });
    },
  );

  it('fails when Steam refuses, even with HTTP 200', async () => {
    stubStore(() => Response.json({ success: false, wishlistCount: 0 }));
    await expect(
      setGameInterest(SESSION, 620, 'wishlisted', true),
    ).rejects.toThrow();

    stubStore(() => Response.json(null, { status: 401 }));
    await expect(
      setGameInterest(SESSION, 620, 'following', true),
    ).rejects.toThrow();
  });

  it('takes the plain `true` following answers with', async () => {
    stubStore(() => Response.json(true));
    await expect(
      setGameInterest(SESSION, 620, 'following', true),
    ).resolves.toBeUndefined();
  });
});

describe('getGameInterest', () => {
  it("asks the CM for the game's state, leaving out what Steam leaves out", async () => {
    const calls: [string, object][] = [];
    const cm = {
      async call(method: string, request: object) {
        calls.push([method, request]);
        return { wishlist: true, ignored: false };
      },
    } as unknown as SteamCM;

    expect(await getGameInterest(cm, 620)).toEqual({
      owned: false,
      wishlisted: true,
      following: false,
      ignored: false,
      playedElsewhere: false,
    });
    expect(calls).toEqual([
      ['Store.GetUserGameInterestState#1', { appid: 620 }],
    ]);
  });

  it('tells ignoring as played on another platform from not being interested', async () => {
    const cm = (state: { ignored_reason: number }) =>
      ({
        call: async () => ({ ignored: true, ...state }),
      }) as unknown as SteamCM;

    expect(await getGameInterest(cm({ ignored_reason: 2 }), 620)).toMatchObject(
      {
        ignored: true,
        playedElsewhere: true,
      },
    );
    expect(await getGameInterest(cm({ ignored_reason: 0 }), 620)).toMatchObject(
      {
        ignored: true,
        playedElsewhere: false,
      },
    );
  });
});
