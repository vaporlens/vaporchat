import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGameReviews, getReviewSummary } from './reviews.ts';

const AUTHOR = '76561197960265729';
const REVIEW = {
  recommendationid: '7',
  author: { steamid: AUTHOR, playtime_at_review: 90 },
  review: 'Good [b]fun[/b]',
  timestamp_created: 1_700_000_000,
  voted_up: false,
  votes_up: 3,
};

/** Answers the reviews API with `reviews` and `cursor`, profiles with `profile`, records the requests. */
function stubSteam(
  page: (cursor: string) => { reviews: object[]; cursor: string },
  profile: () => Response,
) {
  const asked: URL[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const parsed = new URL(url);
    asked.push(parsed);
    if (parsed.pathname.startsWith('/profiles/')) return profile();
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
        new Response(
          '<profile><steamID><![CDATA[Player]]></steamID><avatarFull><![CDATA[https://a.jpg]]></avatarFull></profile>',
        ),
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
    expect(profile?.href).toBe(
      `https://steamcommunity.com/profiles/${AUTHOR}/?xml=1`,
    );
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

describe('getReviewSummary', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Answers GetAppReviews with `summary`, records the requests. */
  function stubSummary(summary: object) {
    const asked: URL[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(new URL(url));
      return Response.json({
        response: { query_summary: summary, reviews: [] },
      });
    });
    return asked;
  }

  it('counts reviews in all languages, from all purchases and off-topic ones, with the rating rounded down like the store', async () => {
    const asked = stubSummary({
      review_score: 8,
      review_score_desc: 'Very Positive',
      total_positive: 1085,
      total_negative: 75,
      total_reviews: 1160,
    });
    expect(await getReviewSummary(10)).toEqual({
      label: 'Very Positive',
      percentPositive: 93,
      count: 1160,
    });
    expect(JSON.parse(asked[0]!.searchParams.get('input_json')!)).toMatchObject(
      {
        appid: 10,
        languages: ['all'],
        purchase_type: 1,
        return_query_summary: true,
        filter_offtopic_activity: 0,
      },
    );
  });

  it('has no label for a game with too few reviews to rate, or none', async () => {
    stubSummary({
      review_score: 0,
      review_score_desc: '3 user reviews',
      total_positive: 2,
      total_reviews: 3,
    });
    expect(await getReviewSummary(10)).toEqual({
      label: null,
      percentPositive: 66,
      count: 3,
    });
    stubSummary({
      review_score: 0,
      review_score_desc: 'No user reviews',
      total_positive: 0,
      total_reviews: 0,
    });
    expect(await getReviewSummary(10)).toEqual({
      label: null,
      percentPositive: 0,
      count: 0,
    });
  });

  it('fails when Steam answers without a summary', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ response: {} }));
    await expect(getReviewSummary(10)).rejects.toThrow();
  });
});
