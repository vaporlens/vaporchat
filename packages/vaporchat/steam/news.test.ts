import { describe, expect, it } from 'vitest';
import { yourDocuments } from './news.ts';

describe('yourDocuments', () => {
  it("keeps the news of the user's games and groups, not featured or recommended news", () => {
    expect(
      yourDocuments({
        documents: [
          { unique_id: 'owned', appid: 1, clanid: 100, start_time: 9 },
          { unique_id: 'featured', appid: 2, clanid: 200, start_time: 8 },
          { unique_id: 'wishlisted', appid: 3, clanid: 300, start_time: 7 },
          { unique_id: 'followed group', appid: 0, clanid: 400, start_time: 6 },
          { unique_id: 'recommended', appid: 5, clanid: 500, start_time: 5 },
          { unique_id: 'unknown', appid: 6, clanid: 600, start_time: 4 },
        ],
        apps: [
          { appid: 1, source: 1 | 64 },
          { appid: 2, source: 64 },
          { appid: 3, source: 2 },
          { appid: 5, source: 8 },
        ],
        // the app decides for news of an app, not its developer's group
        clans: [
          { clanid: 200, source: 4 },
          { clanid: 400, source: 4 },
        ],
      }).map(({ unique_id }) => unique_id),
    ).toEqual(['owned', 'wishlisted', 'followed group']);
  });
});
