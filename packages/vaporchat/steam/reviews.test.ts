import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ApiReview, getGameReviews, toGameReview } from './reviews.ts';

const REVIEW: ApiReview = {
  recommendationid: '7',
  author: { personaname: 'Player', avatar: 'abc', playtime_at_review: 90 },
  review: 'Good [b]fun[/b]',
  timestamp_created: 1_700_000_000,
  voted_up: false,
  votes_up: 3,
};

describe('toGameReview', () => {
  it('turns playtime into hours, seconds into milliseconds and BBCode into blocks', () => {
    expect(toGameReview(REVIEW)).toEqual({
      id: '7',
      author: 'Player',
      avatarUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
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
    });
  });
});

describe('getGameReviews', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('passes the cursor on and ends on a page without reviews', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const first = url.includes('cursor=*');
      return Response.json({
        reviews: first ? [REVIEW] : [],
        cursor: first ? 'a+b=' : 'c',
      });
    });
    const first = await getGameReviews(10, null);
    expect(first.next).toBe('a+b=');
    expect(await getGameReviews(10, first.next)).toEqual({
      items: [],
      next: null,
    });
    expect(asked[1]).toContain('/appreviews/10?');
    expect(asked[1]).toContain('cursor=a%2Bb%3D');
  });
});
