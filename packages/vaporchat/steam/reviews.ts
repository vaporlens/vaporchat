import type { FeedPage, GameReview } from '../protocol.ts';
import { avatarUrl } from './friends.ts';
import { parseRichText } from './richText.ts';
import { getJson, STORE_URL } from './web.ts';

const PAGE_SIZE = 20;

/** A review as the store's appreviews endpoint has it, only what we use. */
export interface ApiReview {
  recommendationid: string;
  author: {
    personaname?: string;
    avatar?: string;
    playtime_at_review?: number;
  };
  /** BBCode */
  review: string;
  /** seconds since the epoch */
  timestamp_created: number;
  voted_up: boolean;
  votes_up: number;
}

export function toGameReview(review: ApiReview): GameReview {
  return {
    id: review.recommendationid,
    author: review.author.personaname ?? '',
    avatarUrl: avatarUrl(review.author.avatar ?? ''),
    recommended: review.voted_up,
    // minutes
    hoursPlayed: (review.author.playtime_at_review ?? 0) / 60,
    createdAt: review.timestamp_created * 1000,
    helpful: review.votes_up,
    body: parseRichText(review.review, null),
  };
}

/**
 * A page of a game's English reviews, most helpful first like its store page. `cursor` is the
 * `next` of the previous page.
 */
export async function getGameReviews(
  appid: number,
  cursor: string | null,
): Promise<FeedPage<GameReview, string>> {
  const { reviews = [], cursor: next } = await getJson<{
    reviews?: ApiReview[];
    cursor?: string;
  }>(
    `${STORE_URL}appreviews/${appid}?json=1&filter=all&language=english&purchase_type=all` +
      `&num_per_page=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor ?? '*')}`,
  );
  return {
    items: reviews.map(toGameReview),
    next: reviews.length > 0 && next ? next : null,
  };
}
