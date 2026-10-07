import type { GameDetails } from '../protocol.ts';
import { parseRichText } from './richText.ts';
import { type ApiStoreItem, callApi, context, toStoreItem } from './store.ts';
import { ASSETS_URL, VIDEO_URL } from './web.ts';

const SHOWN_TAGS = 12;
// ESteamDeckCompatibilityCategory
const STEAM_DECK = {
  1: 'unsupported',
  2: 'playable',
  3: 'verified',
} as const;

interface ApiTrailer {
  /** like `steam/apps/${FILENAME}?t=1`, for the poster */
  trailer_url_format?: string;
  screenshot_full?: string;
  adaptive_trailers?: { cdn_path?: string; encoding?: string }[];
  all_ages?: boolean;
}

/** What GetItems says about a game's page, besides the store item itself. */
interface ApiGameDetails extends ApiStoreItem {
  basic_info?: {
    short_description?: string;
    developers?: { name?: string }[];
    publishers?: { name?: string }[];
  };
  reviews?: {
    summary_filtered?: {
      review_count?: number;
      percent_positive?: number;
      review_score_label?: string;
    };
  };
  /** most voted first */
  tags?: { tagid: number }[];
  screenshots?: { all_ages_screenshots?: { filename?: string }[] };
  trailers?: { highlights?: ApiTrailer[]; other_trailers?: ApiTrailer[] };
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    steamos_linux?: boolean;
    steam_deck_compat_category?: number;
  };
  full_description_bbcode?: string;
}

// tag names hardly ever change, they are fetched once
let tagNames: Promise<Map<number, string>> | null = null;

function getTagNames() {
  tagNames ??= callApi<{ tags?: { tagid: number; name: string }[] }>(
    'IStoreService/GetTagList',
    { language: 'english' },
  ).then(
    ({ tags = [] }) => new Map(tags.map(({ tagid, name }) => [tagid, name])),
    (err: Error) => {
      tagNames = null;
      throw err;
    },
  );
  return tagNames;
}

function names(list: { name?: string }[] = []) {
  return list.flatMap(({ name }) => (name ? [name] : []));
}

export function toGameDetails(
  item: ApiGameDetails,
  tagNames: Map<number, string>,
): GameDetails {
  const reviews = item.reviews?.summary_filtered;
  const platforms = item.platforms ?? {};
  const deck = platforms.steam_deck_compat_category as
    | keyof typeof STEAM_DECK
    | undefined;
  return {
    ...toStoreItem(item),
    shortDescription: item.basic_info?.short_description ?? '',
    developers: names(item.basic_info?.developers),
    publishers: names(item.basic_info?.publishers),
    reviews: reviews?.review_score_label
      ? {
          label: reviews.review_score_label,
          percentPositive: reviews.percent_positive ?? 0,
          count: reviews.review_count ?? 0,
        }
      : null,
    tags: (item.tags ?? [])
      .flatMap(({ tagid }) => tagNames.get(tagid) ?? [])
      .slice(0, SHOWN_TAGS),
    screenshots: (item.screenshots?.all_ages_screenshots ?? []).flatMap(
      ({ filename }) =>
        filename
          ? [
              {
                url: ASSETS_URL + filename,
                thumbnailUrl:
                  ASSETS_URL + filename.replace(/\.jpg/, '.600x338.jpg'),
              },
            ]
          : [],
    ),
    trailers: [
      ...(item.trailers?.highlights ?? []),
      ...(item.trailers?.other_trailers ?? []),
    ].flatMap((trailer) => {
      // the stream both iOS and Android play
      const hls = trailer.adaptive_trailers?.find(
        ({ encoding }) => encoding === 'hls_h264',
      );
      const { trailer_url_format: format, screenshot_full: poster } = trailer;
      return trailer.all_ages && hls?.cdn_path && format && poster
        ? [
            {
              url: VIDEO_URL + hls.cdn_path,
              posterUrl:
                ASSETS_URL +
                // biome-ignore lint/suspicious/noTemplateCurlyInString: steam's placeholder
                format.replace('${FILENAME}', poster),
            },
          ]
        : [];
    }),
    platforms: [
      ...(platforms.windows ? ['Windows'] : []),
      ...(platforms.mac ? ['macOS'] : []),
      ...(platforms.steamos_linux ? ['Linux'] : []),
    ],
    steamDeck: (deck && STEAM_DECK[deck]) ?? null,
    description: parseRichText(
      item.full_description_bbcode ?? '',
      item.appid ?? null,
    ),
  };
}

/** A game's store page: descriptions, screenshots, trailers, reviews and tags. */
export async function getGameDetails(appid: number, country: string) {
  const [{ store_items = [] }, tags] = await Promise.all([
    callApi<{ store_items?: ApiGameDetails[] }>(
      'IStoreBrowseService/GetItems',
      {
        ids: [{ appid }],
        context: context(country),
        data_request: {
          include_assets: true,
          include_release: true,
          include_platforms: true,
          include_screenshots: true,
          include_trailers: true,
          include_reviews: true,
          include_tag_count: SHOWN_TAGS,
          include_basic_info: true,
          include_full_description: true,
        },
      },
    ),
    getTagNames(),
  ]);
  const item = store_items[0];
  if (item?.success !== 1) throw new Error('This game is not in the store');
  return toGameDetails(item, tags);
}
