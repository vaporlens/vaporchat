import type {
  GameDetails,
  GameFeature,
  Requirements,
  StoreRef,
  SystemRequirements,
} from '../protocol.ts';
import { parseRichText } from './richText.ts';
import {
  type ApiStoreItem,
  callApi,
  context,
  DATA_REQUEST,
  toReviewSummary,
  toStoreItem,
} from './store.ts';
import { ASSETS_URL, VIDEO_URL } from './web.ts';

const SHOWN_TAGS = 12;
const SIMILAR_GAMES = 12;
// it gives 20 by default, games have hundreds at most
const ALL_DLC = 2000;
// EPlatform, as system requirements have it
const PLATFORMS: Record<number, string | undefined> = {
  1: 'Windows',
  2: 'macOS',
  3: 'Linux',
};
// the store page's questions, in its order
const EARLY_ACCESS_QUESTIONS = [
  ['why_bbcode', 'Why Early Access?'],
  ['how_long_bbcode', 'How long will this game be in Early Access?'],
  [
    'full_version_bbcode',
    'How is the full version planned to differ from the Early Access version?',
  ],
  [
    'current_state_bbcode',
    'What is the current state of the Early Access version?',
  ],
  [
    'pricing_bbcode',
    'Will the game be priced differently during and after Early Access?',
  ],
  [
    'community_bbcode',
    'How are you planning on involving the Community in your development process?',
  ],
] as const;
// where the store's own pictures are, like its feature icons
const STORE_STATIC_URL = 'https://store.fastly.steamstatic.com/';
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

interface ApiSize {
  amount?: string;
  units?: string;
}

interface ApiRequirements {
  os_version?: string;
  processor?: string;
  memory?: ApiSize;
  graphics?: string;
  directx?: string;
  broadband?: boolean;
  storage?: ApiSize;
  sound_card?: string;
  vr_support?: string;
  notes?: string;
  /** older games' own text, or a token like `#sys_req_OrangeBox` the store translates */
  legacy_bbcode?: string;
}

/** What GetItems says about a game's page, besides the store item itself. */
interface ApiGameDetails extends ApiStoreItem {
  release?: ApiStoreItem['release'] & { is_early_access?: boolean };
  purchase_options?: { packageid?: number; bundleid?: number }[];
  links?: { url?: string }[];
  extra_details?: {
    early_access?: Partial<
      Record<(typeof EARLY_ACCESS_QUESTIONS)[number][0], string>
    >;
    links_and_info?: { website?: string };
    system_requirements?: {
      platforms?: {
        platform?: number;
        minimum?: ApiRequirements;
        recommended?: ApiRequirements;
      }[];
    };
  };
  basic_info?: {
    short_description?: string;
    developers?: { name?: string }[];
    publishers?: { name?: string }[];
  };
  /** most voted first */
  tags?: { tagid: number }[];
  categories?: {
    supported_player_categoryids?: number[];
    feature_categoryids?: number[];
    controller_categoryids?: number[];
  };
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

/** What `load` gets, fetched once and asked again only if it failed. */
function fetchedOnce<T>(load: () => Promise<T>) {
  let loaded: Promise<T> | null = null;
  return () => {
    loaded ??= load().catch((err: Error) => {
      loaded = null;
      throw err;
    });
    return loaded;
  };
}

// tag and feature names hardly ever change
const getTagNames = fetchedOnce(() =>
  callApi<{ tags?: { tagid: number; name: string }[] }>(
    'IStoreService/GetTagList',
    { language: 'english' },
  ).then(
    ({ tags = [] }) => new Map(tags.map(({ tagid, name }) => [tagid, name])),
  ),
);

const getFeatures = fetchedOnce(() =>
  callApi<{
    categories?: {
      categoryid: number;
      display_name: string;
      /** like `public/images/v6/ico/ico_cloud.png` */
      image_url: string;
    }[];
  }>('IStoreBrowseService/GetStoreCategories', { language: 'english' }).then(
    ({ categories = [] }) =>
      new Map(
        categories.flatMap(
          ({ categoryid, display_name: name, image_url: icon }) =>
            // the store's own names for some aren't translated
            name.startsWith('#')
              ? []
              : [[categoryid, { name, iconUrl: STORE_STATIC_URL + icon }]],
        ),
      ),
  ),
);

function names(list: { name?: string }[] = []) {
  return list.flatMap(({ name }) => (name ? [name] : []));
}

function size({ amount, units }: ApiSize = {}) {
  return amount && units ? `${amount} ${units}` : '';
}

function toRequirements(
  api: ApiRequirements | undefined,
  appid: number | null,
): Requirements | null {
  if (!api) return null;
  const memory = size(api.memory);
  const storage = size(api.storage);
  const rows = [
    ['OS', api.os_version ?? ''],
    ['Processor', api.processor ?? ''],
    ['Memory', memory && `${memory} RAM`],
    ['Graphics', api.graphics ?? ''],
    ['DirectX', api.directx ? `Version ${api.directx}` : ''],
    ['Network', api.broadband ? 'Broadband Internet connection' : ''],
    ['Storage', storage && `${storage} available space`],
    ['Sound Card', api.sound_card ?? ''],
    ['VR Support', api.vr_support ?? ''],
    ['Additional Notes', api.notes ?? ''],
  ].flatMap(([label, value]) => (value ? [{ label, value }] : []));
  // the store's tokens aren't text
  const legacy = api.legacy_bbcode?.startsWith('#') ? '' : api.legacy_bbcode;
  const text = parseRichText(legacy ?? '', appid);
  return rows.length > 0 || text.length > 0 ? { rows, text } : null;
}

function toEdition({
  packageid,
  bundleid,
}: NonNullable<ApiGameDetails['purchase_options']>[number]): StoreRef[] {
  if (bundleid) return [{ bundleid }];
  return packageid ? [{ packageid }] : [];
}

/** A link's site, like `discord.gg`. */
function site(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;
}

export function toGameDetails(
  item: ApiGameDetails,
  tagNames: Map<number, string>,
  features: Map<number, GameFeature>,
  /** in the store's order */
  dlc: number[] = [],
): GameDetails {
  const categories = item.categories ?? {};
  // like the store page lists them: players, then controllers, then the rest
  const listed = [
    ...(categories.supported_player_categoryids ?? []),
    ...(categories.controller_categoryids ?? []),
    ...(categories.feature_categoryids ?? []),
  ].flatMap((id) => features.get(id) ?? []);
  const platforms = item.platforms ?? {};
  const extra = item.extra_details ?? {};
  const website = extra.links_and_info?.website;
  const deck = platforms.steam_deck_compat_category as
    | keyof typeof STEAM_DECK
    | undefined;
  return {
    ...toStoreItem(item),
    shortDescription: item.basic_info?.short_description ?? '',
    developers: names(item.basic_info?.developers),
    publishers: names(item.basic_info?.publishers),
    reviews: toReviewSummary(item),
    tags: (item.tags ?? [])
      .flatMap(({ tagid }) => {
        const name = tagNames.get(tagid);
        return name ? [{ tagid, name }] : [];
      })
      .slice(0, SHOWN_TAGS),
    // a few names are there twice, for different controllers
    features: [
      ...new Map(listed.map((feature) => [feature.name, feature])).values(),
    ],
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
    // the game alone is its best option, its price is the item's
    editions: (item.purchase_options ?? [])
      .filter(
        ({ packageid }) => packageid !== item.best_purchase_option?.packageid,
      )
      .flatMap(toEdition),
    dlc,
    earlyAccess: item.release?.is_early_access
      ? EARLY_ACCESS_QUESTIONS.flatMap(([field, question]) => {
          const answer = parseRichText(
            extra.early_access?.[field] ?? '',
            item.appid ?? null,
          );
          return answer.length > 0 ? [{ question, answer }] : [];
        })
      : null,
    links: [
      ...(website ? [{ label: 'Website', url: website }] : []),
      ...(item.links ?? []).flatMap(({ url }) =>
        url && url !== website ? [{ label: site(url), url }] : [],
      ),
    ],
    requirements: (extra.system_requirements?.platforms ?? []).flatMap(
      (requirements): SystemRequirements[] => {
        const platform = PLATFORMS[requirements.platform ?? 0];
        const minimum = toRequirements(
          requirements.minimum,
          item.appid ?? null,
        );
        const recommended = toRequirements(
          requirements.recommended,
          item.appid ?? null,
        );
        return platform && (minimum || recommended)
          ? [{ platform, minimum, recommended }]
          : [];
      },
    ),
  };
}

/** A game's store page: descriptions, screenshots, trailers, reviews, tags, features, editions, DLC. */
export async function getGameDetails(appid: number, country: string) {
  const [{ store_items = [] }, tags, features, { dlc_lists = [] }] =
    await Promise.all([
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
            include_all_purchase_options: true,
            include_links: true,
            include_extra_details: true,
          },
        },
      ),
      getTagNames(),
      getFeatures(),
      callApi<{ dlc_lists?: { dlc_appids?: number[] }[] }>(
        'IStoreBrowseService/GetDLCForAppsSolr',
        { appids: [appid], context: context(country), count: ALL_DLC },
        // the page works without it, failing just shows no DLC
      ).catch(() => ({ dlc_lists: [] })),
    ]);
  const item = store_items[0];
  if (item?.success !== 1) throw new Error('This game is not in the store');
  return toGameDetails(item, tags, features, dlc_lists[0]?.dlc_appids);
}

/** Games like this one, as the store page's "More like this" picks them. */
export async function getSimilarGames(appid: number, country: string) {
  const { store_items = [] } = await callApi<{ store_items?: ApiStoreItem[] }>(
    'IStoreQueryService/MoreLikeThis',
    {
      item_id: { appid },
      context: context(country),
      count: SIMILAR_GAMES,
      data_request: DATA_REQUEST,
    },
  );
  return store_items
    .filter((item) => item.success === 1 && item.visible !== false)
    .map(toStoreItem);
}
