import type {
  FeedPage,
  GameReview,
  ReviewCounts,
  ReviewHistogram,
  ReviewSummary,
} from '../protocol.ts';
import { getAuthor } from './comments.ts';
import { parseRichText } from './richText.ts';
import { callApi } from './store.ts';
import { getJson, STORE_URL } from './web.ts';

const PAGE_SIZE = 20;
// GetAppReviews' EUserReviewsAppReviewsFilter and EUserReviewsPurchaseType
const MOST_HELPFUL = 0;
const ANY_PURCHASE = 1;

/** A review as GetAppReviews has it, only what we use. */
interface ApiReview {
  recommendationid: string;
  author: { steamid: string; playtime_at_review?: number };
  /** BBCode */
  review: string;
  /** seconds since the epoch */
  timestamp_created: number;
  voted_up: boolean;
  votes_up: number;
}

/**
 * A page of a game's English reviews, most helpful first like its store page. `cursor` is the
 * `next` of the previous page.
 */
export async function getGameReviews(
  appid: number,
  cursor: string | null,
): Promise<FeedPage<GameReview, string>> {
  const { reviews = [], cursor: next } = await callApi<{
    reviews?: ApiReview[];
    cursor?: string;
  }>('IUserReviewsService/GetAppReviews', {
    appid,
    filter: MOST_HELPFUL,
    languages: ['english'],
    purchase_type: ANY_PURCHASE,
    num_per_page: PAGE_SIZE,
    cursor: cursor ?? '*',
  });
  // the reviews only have their authors' steamids
  const steamids = [...new Set(reviews.map(({ author }) => author.steamid))];
  const authors = new Map(
    await Promise.all(
      steamids.map(async (id) => [id, await getAuthor(id)] as const),
    ),
  );
  return {
    items: reviews.map((review) => ({
      id: review.recommendationid,
      author: authors.get(review.author.steamid)?.name ?? '',
      avatarUrl: authors.get(review.author.steamid)?.avatarUrl ?? null,
      recommended: review.voted_up,
      // minutes
      hoursPlayed: (review.author.playtime_at_review ?? 0) / 60,
      createdAt: review.timestamp_created * 1000,
      helpful: review.votes_up,
      body: parseRichText(review.review, null),
    })),
    next: reviews.length > 0 && next ? next : null,
  };
}

/**
 * A game's reviews in short, from all languages and purchases, off-topic ones too. The store's
 * summary counts only Steam purchasers for paid games, leaving out key activations.
 */
export async function getReviewSummary(appid: number): Promise<ReviewSummary> {
  const { query_summary: summary } = await callApi<{
    query_summary?: {
      /** 0 with too few reviews to rate */
      review_score?: number;
      review_score_desc?: string;
      total_positive?: number;
      total_reviews?: number;
    };
  }>('IUserReviewsService/GetAppReviews', {
    appid,
    filter: MOST_HELPFUL,
    languages: ['all'],
    purchase_type: ANY_PURCHASE,
    // 0 gives the default 20
    num_per_page: 1,
    cursor: '*',
    return_query_summary: true,
    // off-topic review bombs count too
    filter_offtopic_activity: 0,
  });
  // Steam answers an error with an empty response
  if (!summary) throw new Error('Steam gave no review summary');
  const count = summary.total_reviews ?? 0;
  return {
    label: summary.review_score ? (summary.review_score_desc ?? null) : null,
    percentPositive: count
      ? // the store rounds down
        Math.floor(((summary.total_positive ?? 0) / count) * 100)
      : 0,
    count,
  };
}

interface ApiReviewCounts {
  /** seconds since the epoch */
  date: number;
  recommendations_up: number;
  recommendations_down: number;
}

function toCounts(counts: ApiReviewCounts[] = []): ReviewCounts[] {
  return counts.map((c) => ({
    at: c.date * 1000,
    up: c.recommendations_up,
    down: c.recommendations_down,
  }));
}

/** A game's reviews in all languages over time, the store page's chart. */
export async function getReviewHistogram(
  appid: number,
): Promise<ReviewHistogram> {
  const { results } = await getJson<{
    results?: {
      rollup_type?: string;
      rollups?: ApiReviewCounts[];
      recent?: ApiReviewCounts[];
    };
  }>(
    `${STORE_URL}appreviewhistogram/${appid}?l=english&review_score_preference=0`,
  );
  return {
    overall: toCounts(results?.rollups),
    overallPeriod: results?.rollup_type === 'week' ? 'week' : 'month',
    recent: toCounts(results?.recent),
  };
}
