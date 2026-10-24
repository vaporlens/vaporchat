import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGameReviews } from './reviews.ts';

// account id 1
const AUTHOR = '76561197960265729';
const REVIEW = {
  recommendationid: '7',
  author: { steamid: AUTHOR, playtime_at_review: 90 },
  review: 'Good [b]fun[/b]',
  timestamp_created: 1_700_000_000,
  voted_up: false,
  votes_up: 3,
};

/** Answers the reviews API with `reviews` and `cursor`, mini profiles with `profile`, records the requests. */
function stubSteam(
  page: (cursor: string) => { reviews: object[]; cursor: string },
  profile: () => Response,
) {
  const asked: URL[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const parsed = new URL(url);
    asked.push(parsed);
    if (parsed.pathname.includes('/miniprofile/')) return profile();
    const { cursor } = JSON.parse(parsed.searchParams.get('input_json')!);
    return Response.json({ response: page(cursor) });
  });
  return asked;
}

describe('getGameReviews', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks GetAppReviews for English reviews most helpful first, with their authors' names and pictures", async () => {
    const asked = stubSteam(
      () => ({ reviews: [REVIEW], cursor: 'a+b=' }),
      () =>
        Response.json({ persona_name: 'Player', avatar_url: 'https://a.jpg' }),
    );

    expect(await getGameReviews(10, null)).toEqual({
      items: [
        {
          id: '7',
          author: 'Player',
          avatarUrl: 'https://a.jpg',
          recommended: false,
          hoursPlayed: 1.5,
          createdAt: 1_700_000_000_000,
          helpful: 3,
          body: [
            {
              kind: 'paragraph',
              spans: [{ text: 'Good ' }, { text: 'fun', bold: true }],
            },
          ],
        },
      ],
      next: 'a+b=',
    });
    const [request, profile] = asked;
    expect(request?.pathname).toBe('/IUserReviewsService/GetAppReviews/v1/');
    expect(JSON.parse(request!.searchParams.get('input_json')!)).toEqual({
      appid: 10,
      filter: 0,
      languages: ['english'],
      purchase_type: 1,
      num_per_page: 20,
      cursor: '*',
    });
    expect(profile?.pathname).toBe('/miniprofile/1/json');
  });

  it('passes the cursor on, ends on a page without reviews and shows a review whose author did not load', async () => {
    stubSteam(
      (cursor) =>
        cursor === '*'
          ? { reviews: [REVIEW], cursor: 'a+b=' }
          : { reviews: [], cursor: 'c' },
      () => new Response(null, { status: 429 }),
    );

    const first = await getGameReviews(10, null);
    expect(
      first.items.map(({ author, avatarUrl }) => ({ author, avatarUrl })),
    ).toEqual([{ author: '', avatarUrl: null }]);
    expect(await getGameReviews(10, first.next)).toEqual({
      items: [],
      next: null,
    });
  });
});
