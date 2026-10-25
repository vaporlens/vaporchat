import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type {
  GameDetails,
  GameInterest,
  SteamEvent,
  StoreItem,
} from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailPage } from '../components/DetailPage';
import { KeepOpened } from '../components/KeepOpened';
import { type MediaItem, MediaTile, mediaCount } from '../components/MediaTile';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { SubTabs } from '../components/SubTabs';
import { releaseDate } from '../format';
import { openLink } from '../links';
import { colors, gridGutter } from '../theme';
import { useMarkWishlisted } from '../userApps';
import {
  getVaporlensReport,
  type VaporlensReport as Report,
  vaporlensUrl,
} from '../vaporlens';
import { TagChip } from './BrowseScreen';
import { BuyHeader, reviewColor } from './FeedCards';
import { GameNews } from './GameNews';
import { GameReviews } from './GameReviews';
import {
  EarlyAccessAnswers,
  EarlyAccessNotice,
  Editions,
  GameDlc,
  Links,
  SimilarGames,
  SystemRequirementsList,
} from './GameSections';
import type { Page } from './PageScreen';
import { VaporlensReport } from './VaporlensReport';
import { RequestAnalysis, useGameFit } from './VaporlensUser';

const DECK = {
  verified: 'Steam Deck Verified',
  playable: 'Steam Deck Playable',
  unsupported: 'Unsupported on Steam Deck',
};

type Tab =
  | 'overview'
  | 'media'
  | 'about'
  | 'dlc'
  | 'reviews'
  | 'news'
  | 'similar';

// the store page's buttons, off and on
const ACTIONS = [
  {
    interest: 'wishlisted',
    off: 'Wishlist',
    on: 'On wishlist',
    icon: 'heart-outline',
    iconOn: 'heart',
  },
  {
    interest: 'following',
    off: 'Follow',
    on: 'Following',
    icon: 'notifications-outline',
    iconOn: 'notifications',
  },
  {
    interest: 'ignored',
    off: 'Ignore',
    on: 'Ignored',
    icon: 'eye-off-outline',
    iconOn: 'eye-off',
  },
] as const;

/** Which ignore the user picked, like the store's menu, or null to keep the game. */
function askIgnore() {
  return new Promise<'ignored' | 'playedElsewhere' | null>((resolve) =>
    Alert.alert(
      'Ignore this game?',
      'The store stops recommending it. Played elsewhere still counts it for your recommendations.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Played elsewhere', onPress: () => resolve('playedElsewhere') },
        { text: 'Not interested', onPress: () => resolve('ignored') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    ),
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (value === '') return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function Overview({
  appid,
  game,
  report,
  onOpenPage,
}: {
  appid: number;
  game: GameDetails;
  /** null when VaporLens hasn't analyzed the game (or isn't reachable) */
  report: Report | null;
  /** a tag's games */
  onOpenPage: (page: Page) => void;
}) {
  const fit = useGameFit(appid);
  // pages cached before these were loaded have none
  const links = game.links ?? [];
  return (
    <>
      {game.earlyAccess && (
        <EarlyAccessNotice answered={game.earlyAccess.length > 0} />
      )}
      {game.shortDescription !== '' && (
        <Text style={styles.lead}>{game.shortDescription}</Text>
      )}
      <View style={styles.facts}>
        <Fact label="Release date" value={releaseDate(game) ?? ''} />
        <Fact label="Developer" value={game.developers.join(', ')} />
        <Fact label="Publisher" value={game.publishers.join(', ')} />
        <Fact
          label="Platforms"
          value={[
            game.platforms.join(', '),
            game.steamDeck ? DECK[game.steamDeck] : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      </View>
      {game.tags.length > 0 && (
        <View style={styles.tags}>
          {/* pages cached before tags had ids have their names only */}
          {game.tags
            .filter((tag) => typeof tag === 'object')
            .map((tag) => (
              <TagChip key={tag.tagid} tag={tag} onOpenPage={onOpenPage} />
            ))}
        </View>
      )}
      {/* pages cached before features were loaded have none */}
      {(game.features ?? []).length > 0 && (
        <View style={styles.features}>
          {game.features.map((feature) => (
            <View key={feature.name} style={styles.feature}>
              <Image
                source={feature.iconUrl}
                style={styles.featureIcon}
                tintColor={colors.muted}
              />
              <Text style={styles.featureName}>{feature.name}</Text>
            </View>
          ))}
        </View>
      )}
      {links.length > 0 && <Links links={links} />}
      <RequestAnalysis appid={appid} />
      {report && (
        <VaporlensReport
          report={report}
          fit={fit}
          originalPrice={game.originalPrice ?? game.price}
          onOpenFull={() => openLink(vaporlensUrl(appid))}
        />
      )}
    </>
  );
}

/** Wishlisting, following and ignoring the game, left out when signed out. */
function Actions({
  feeds,
  appid,
  onError,
}: {
  feeds: SteamFeeds;
  appid: number;
  onError: (err: Error) => void;
}) {
  const [interest, setInterest] = useState<GameInterest | null>(null);
  const [changing, setChanging] = useState(false);
  const markWishlisted = useMarkWishlisted();
  useEffect(() => {
    let shown = true;
    feeds
      .getGameInterest(appid)
      .then((loaded) => shown && setInterest(loaded))
      // signed out, or steam didn't say: the page works without them
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [feeds, appid]);
  if (!interest) return null;

  const change = async (kind: (typeof ACTIONS)[number]['interest']) => {
    // ignoring asks why, undoing it doesn't
    const asked =
      kind === 'ignored' && !interest.ignored ? await askIgnore() : kind;
    if (!asked) return;
    setChanging(true);
    feeds
      .setGameInterest(appid, asked, !interest[kind])
      .then((changed) => {
        setInterest(changed);
        // only when it changed, marking it reloads the Wishlist tab
        if (changed.wishlisted !== interest.wishlisted)
          markWishlisted(appid, changed.wishlisted);
      })
      .catch(onError)
      .finally(() => setChanging(false));
  };
  return (
    <View style={styles.actions}>
      {ACTIONS.map(({ interest: kind, off, on, icon, iconOn }) =>
        // an owned game can't be wishlisted, its button says it's owned
        kind === 'wishlisted' && interest.owned ? (
          <View key={kind} style={[styles.action, styles.actionOwned]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accept} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.actionText, styles.actionTextOwned]}
            >
              In library
            </Text>
          </View>
        ) : (
          <Pressable
            key={kind}
            disabled={changing}
            onPress={() => change(kind)}
            style={({ pressed }) => [
              styles.action,
              interest[kind] && styles.actionOn,
              (pressed || changing) && styles.pressed,
            ]}
          >
            <Ionicons
              name={interest[kind] ? iconOn : icon}
              size={18}
              color={interest[kind] ? colors.accent : colors.text}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.actionText, interest[kind] && styles.actionTextOn]}
            >
              {!interest[kind]
                ? off
                : kind === 'ignored' && interest.playedElsewhere
                  ? 'Played elsewhere'
                  : on}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** All trailers and screenshots, two to a row. */
function Media({
  media,
  onOpenImage,
}: {
  media: MediaItem[];
  onOpenImage: (url: string) => void;
}) {
  return (
    <>
      <Text style={styles.muted}>{mediaCount(media)}</Text>
      <View style={styles.grid}>
        {media.map((item) => (
          <View key={item.url} style={styles.cell}>
            <MediaTile
              item={item}
              style={styles.tile}
              onOpenImage={onOpenImage}
            />
          </View>
        ))}
      </View>
    </>
  );
}

function Details({
  feeds,
  appid,
  game,
  report,
  refreshes,
  onOpenImage,
  onOpenGame,
  onOpenPage,
  onError,
}: {
  feeds: SteamFeeds;
  appid: number;
  game: GameDetails;
  report: Report | null;
  /** times the page was pulled to refresh, reviews and news load again each time */
  refreshes: number;
  onOpenImage: (url: string) => void;
  onOpenGame: (item: StoreItem) => void;
  onOpenPage: (page: Page) => void;
  onError: (err: Error) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const openEvent = useCallback(
    (event: SteamEvent) => onOpenPage({ kind: 'article', event }),
    [onOpenPage],
  );
  // pages cached before trailers were loaded have none
  const media = [...(game.trailers ?? []), ...game.screenshots];
  // pages cached before these were loaded have none
  const requirements = game.requirements ?? [];
  const dlc = game.dlc ?? [];
  const editions = game.editions ?? [];
  const tabs = (
    [
      { tab: 'overview', title: 'Overview', shown: true },
      { tab: 'media', title: 'Media', shown: media.length > 0 },
      {
        tab: 'about',
        title: 'About',
        shown:
          game.description.length > 0 ||
          !!game.earlyAccess?.length ||
          requirements.length > 0,
      },
      {
        tab: 'dlc',
        title: 'DLC & editions',
        shown: dlc.length > 0 || editions.length > 0,
      },
      { tab: 'reviews', title: 'Reviews', shown: true },
      { tab: 'news', title: 'News', shown: true },
      { tab: 'similar', title: 'More like this', shown: true },
    ] as const
  ).filter((item) => item.shown);
  return (
    <>
      {game.reviews && (
        <Text style={styles.reviews}>
          <Text
            style={{
              color: reviewColor(game.reviews.percentPositive),
              fontWeight: '700',
            }}
          >
            {game.reviews.label}
          </Text>
          {` · ${game.reviews.percentPositive}% of ${game.reviews.count.toLocaleString()} reviews`}
        </Text>
      )}
      <View style={styles.bleed}>
        <SubTabs tabs={tabs} tab={tab} onChange={setTab} />
      </View>
      {/* kept once opened, coming back to reviews or news keeps the pages loaded */}
      <KeepOpened
        tab={tab}
        render={(name) => (
          <View style={styles.tab}>
            {name === 'overview' && (
              <Overview
                appid={appid}
                game={game}
                report={report}
                onOpenPage={onOpenPage}
              />
            )}
            {name === 'media' && (
              <Media media={media} onOpenImage={onOpenImage} />
            )}
            {name === 'about' && (
              <>
                {!!game.earlyAccess?.length && (
                  <EarlyAccessAnswers
                    answers={game.earlyAccess}
                    onOpenImage={onOpenImage}
                  />
                )}
                <RichText blocks={game.description} onOpenImage={onOpenImage} />
                {requirements.length > 0 && (
                  <SystemRequirementsList
                    requirements={requirements}
                    onOpenImage={onOpenImage}
                  />
                )}
              </>
            )}
            {name === 'dlc' && (
              <>
                {editions.length > 0 && (
                  <Editions
                    feeds={feeds}
                    appid={appid}
                    editions={editions}
                    onOpenGame={onOpenGame}
                  />
                )}
                {dlc.length > 0 && (
                  <View style={styles.section}>
                    <SectionTitle title="DLC" />
                    <GameDlc
                      feeds={feeds}
                      appid={appid}
                      dlc={dlc}
                      onOpenGame={onOpenGame}
                      onError={onError}
                    />
                  </View>
                )}
              </>
            )}
            {name === 'reviews' && (
              <GameReviews
                key={refreshes}
                feeds={feeds}
                appid={appid}
                onOpenImage={onOpenImage}
                onError={onError}
              />
            )}
            {name === 'news' && (
              <GameNews
                key={refreshes}
                feeds={feeds}
                appid={appid}
                onOpenEvent={openEvent}
                onError={onError}
              />
            )}
            {name === 'similar' && (
              <SimilarGames
                feeds={feeds}
                appid={appid}
                vaporlensSimilar={report?.similar}
                onOpenGame={onOpenGame}
              />
            )}
          </View>
        )}
      />
    </>
  );
}

/** A game's store page: price and reviews over tabs of its facts, media, description, DLC and editions, reviews, news and games like it. */
export function GameScreen({
  feeds,
  item,
  onBack,
  onOpenImage,
  onOpenGame,
  onOpenPage,
  onError,
}: {
  feeds: SteamFeeds;
  /** shown right away, the rest of the page loads */
  item: StoreItem & { appid: number };
  onBack: () => void;
  onOpenImage: (url: string) => void;
  /** a DLC, an edition or a game like it */
  onOpenGame: (item: StoreItem) => void;
  /** a news post */
  onOpenPage: (page: Page) => void;
  onError: (err: Error) => void;
}) {
  const loadGame = useCallback(
    () => feeds.getGame(item.appid),
    [feeds, item.appid],
  );
  const {
    data: game,
    error,
    reload: reloadGame,
  } = useCached(`game-${item.appid}`, loadGame);
  // the page works without it, failing to get it just leaves it out
  const loadReport = useCallback(
    () => getVaporlensReport(item.appid),
    [item.appid],
  );
  const { data: report, reload: reloadReport } = useCached<Report | null>(
    `vaporlens-${item.appid}`,
    loadReport,
  );
  const [refreshes, setRefreshes] = useState(0);
  const refresh = async () => {
    setRefreshes((n) => n + 1);
    await Promise.all([
      reloadGame().catch(onError),
      reloadReport().catch(() => {}),
    ]);
  };

  // the list's item until the page has loaded, its prices are the same
  const shown = game ?? item;
  return (
    <DetailPage
      title={item.name}
      steamUrl={item.url}
      shareable
      onBack={onBack}
      imageUrl={shown.imageUrl}
      imageRatio={460 / 215}
      titleInContent
      onRefresh={refresh}
    >
      <BuyHeader item={shown} />
      <Actions feeds={feeds} appid={item.appid} onError={onError} />
      {game ? (
        <Details
          feeds={feeds}
          appid={item.appid}
          game={game}
          report={report}
          refreshes={refreshes}
          onOpenImage={onOpenImage}
          onOpenGame={onOpenGame}
          onOpenPage={onOpenPage}
          onError={onError}
        />
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : (
        <ActivityIndicator color={colors.muted} style={styles.loading} />
      )}
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  // edge to edge inside the padded page
  bleed: { marginHorizontal: -16 },
  // spaced like the page's own content
  tab: { gap: 14 },
  section: { gap: 8 },
  muted: { color: colors.muted, fontSize: 13 },
  // outlined and sharp-cornered, unlike the pill tabs under them
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBackground,
  },
  actionText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  actionTextOn: { color: colors.accent },
  actionOwned: { borderColor: colors.accept },
  actionTextOwned: { color: colors.accept },
  pressed: { opacity: 0.7 },
  loading: { marginTop: 24 },
  reviews: { color: colors.muted, fontSize: 14 },
  facts: { gap: 6 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 90, color: colors.muted, fontSize: 13 },
  factValue: { flex: 1, color: colors.text, fontSize: 13 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 10,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  // steam's icons are 52x32, padding included
  featureIcon: { width: 26, height: 16 },
  featureName: { color: colors.text, fontSize: 12 },
  // a grid as wide as the page, its cells pad themselves by the gutter
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -16 + gridGutter,
  },
  cell: { width: '50%', padding: gridGutter },
  tile: { width: '100%', aspectRatio: 16 / 9, borderRadius: 6 },
  lead: { color: colors.bright, fontSize: 15, lineHeight: 22 },
});
