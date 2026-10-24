import { afterEach, describe, expect, it, vi } from 'vitest';
import { getComments } from './comments.ts';

const THREAD = { clanSteamid: '1', gidfeature: '2', gidfeature2: '3' };

describe('getComments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names each comment by its author's profile, nameless when that fails, and pages to the total", async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('GetCommentThread')) {
        return Response.json({
          response: {
            total_count: 3,
            comments: [
              { gidcomment: 'a', steamid: '76561197960265729', text: 'hi' },
              { gidcomment: 'b', steamid: '76561197960265730', text: 'yo' },
            ],
          },
        });
      }
      // the first author's profile loads, the second's doesn't
      return url.includes('/profiles/76561197960265729/?xml=1')
        ? new Response(
            '<profile><steamID><![CDATA[Ann]]></steamID><avatarFull><![CDATA[https://a.jpg]]></avatarFull></profile>',
          )
        : new Response(null, { status: 429 });
    });
    const { items, next } = await getComments(THREAD, null);
    expect(
      items.map(({ author, avatarUrl }) => ({ author, avatarUrl })),
    ).toEqual([
      { author: 'Ann', avatarUrl: 'https://a.jpg' },
      { author: '', avatarUrl: null },
    ]);
    expect(next).toBe(2);
  });

  it('ends at the last comment', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('GetCommentThread')
        ? Response.json({
            response: {
              total_count: 3,
              comments: [{ gidcomment: 'c', steamid: '76561197960265729' }],
            },
          })
        : new Response('<profile></profile>'),
    );
    expect((await getComments(THREAD, 2)).next).toBeNull();
  });
});
