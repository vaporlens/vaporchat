import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { GameDetails, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailPage } from '../components/DetailPage';
import { type MediaItem, MediaTile, mediaCount } from '../components/MediaTile';
import { RichText } from '../components/RichText';
import { SubTabs } from '../components/SubTabs';
import { fullDate } from '../format';
import { openLink } from '../links';
import { colors, gridGutter } from '../theme';
import {
  getVaporlensReport,
  type VaporlensReport as Report,
  vaporlensUrl,
} from '../vaporlens';
import { BuyHeader } from './FeedCards';
import { GameReviews } from './GameReviews';
import { VaporlensReport } from './VaporlensReport';

const DECK = {
  verified: 'Steam Deck Verified',
  playable: 'Steam Deck Playable',
  unsupported: 'Unsupported on Steam Deck',
};

type Tab = 'overview' | 'media' | 'about' | 'reviews';

function reviewColor(percentPositive: number) {
  if (percentPositive >= 70) return colors.positive;
  if (percentPositive >= 40) return colors.mixed;
  return colors.negative;
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
}: {
  appid: number;
  game: GameDetails;
  /** null when VaporLens hasn't analyzed the game (or isn't reachable) */
  report: Report | null;
}) {
  return (
    <>
      {game.shortDescription !== '' && (
        <Text style={styles.lead}>{game.shortDescription}</Text>
      )}
      <View style={styles.facts}>
        <Fact
          label="Release date"
          value={game.releasedAt ? fullDate(game.releasedAt) : ''}
        />
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
        <Text style={styles.tags}>{game.tags.join(' · ')}</Text>
      )}
      {report && (
        <VaporlensReport
          report={report}
          originalPrice={game.originalPrice ?? game.price}
          onOpenFull={() => openLink(vaporlensUrl(appid))}
        />
      )}
    </>
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
  onOpenImage,
  onError,
}: {
  feeds: SteamFeeds;
  appid: number;
  game: GameDetails;
  report: Report | null;
  onOpenImage: (url: string) => void;
  onError: (err: Error) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  // kept once opened, leaving it keeps the pages loaded
  const [reviewsOpened, setReviewsOpened] = useState(false);
  // pages cached before trailers were loaded have none
  const media = [...(game.trailers ?? []), ...game.screenshots];
  const tabs = (
    [
      { tab: 'overview', title: 'Overview', shown: true },
      { tab: 'media', title: 'Media', shown: media.length > 0 },
      { tab: 'about', title: 'About', shown: game.description.length > 0 },
      { tab: 'reviews', title: 'Reviews', shown: true },
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
        <SubTabs
          tabs={tabs}
          tab={tab}
          onChange={(next) => {
            setTab(next);
            if (next === 'reviews') setReviewsOpened(true);
          }}
        />
      </View>
      {tab === 'overview' && (
        <Overview appid={appid} game={game} report={report} />
      )}
      {tab === 'media' && <Media media={media} onOpenImage={onOpenImage} />}
      {tab === 'about' && (
        <RichText blocks={game.description} onOpenImage={onOpenImage} />
      )}
      {reviewsOpened && (
        <View style={[styles.tab, tab !== 'reviews' && styles.hidden]}>
          <GameReviews
            feeds={feeds}
            appid={appid}
            onOpenImage={onOpenImage}
            onError={onError}
          />
        </View>
      )}
    </>
  );
}

/** A game's store page: price and reviews over tabs of its facts, media, description and reviews. */
export function GameScreen({
  feeds,
  item,
  onBack,
  onOpenImage,
  onError,
}: {
  feeds: SteamFeeds;
  /** shown right away, the rest of the page loads */
  item: StoreItem & { appid: number };
  onBack: () => void;
  onOpenImage: (url: string) => void;
  onError: (err: Error) => void;
}) {
  const loadGame = useCallback(
    () => feeds.getGame(item.appid),
    [feeds, item.appid],
  );
  const { data: game, error } = useCached(`game-${item.appid}`, loadGame);
  // the page works without it, failing to get it just leaves it out
  const loadReport = useCallback(
    () => getVaporlensReport(item.appid),
    [item.appid],
  );
  const { data: report } = useCached<Report | null>(
    `vaporlens-${item.appid}`,
    loadReport,
  );

  // the list's item until the page has loaded, its prices are the same
  const shown = game ?? item;
  return (
    <DetailPage
      title={item.name}
      steamUrl={item.url}
      onBack={onBack}
      imageUrl={shown.imageUrl}
      imageRatio={460 / 215}
      titleInContent
    >
      <BuyHeader item={shown} />
      {game ? (
        <Details
          feeds={feeds}
          appid={item.appid}
          game={game}
          report={report}
          onOpenImage={onOpenImage}
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
  hidden: { display: 'none' },
  muted: { color: colors.muted, fontSize: 13 },
  loading: { marginTop: 24 },
  reviews: { color: colors.muted, fontSize: 14 },
  facts: { gap: 6 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 90, color: colors.muted, fontSize: 13 },
  factValue: { flex: 1, color: colors.text, fontSize: 13 },
  tags: { color: colors.muted, fontSize: 13, lineHeight: 19 },
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
