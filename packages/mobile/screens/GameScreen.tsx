import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { GameDetails, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailPage } from '../components/DetailPage';
import { type MediaItem, MediaTile, mediaCount } from '../components/MediaTile';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { fullDate } from '../format';
import { openLink } from '../links';
import { colors } from '../theme';
import {
  getVaporlensReport,
  type VaporlensReport as Report,
  vaporlensUrl,
} from '../vaporlens';
import { BuyHeader } from './FeedCards';
import { VaporlensReport } from './VaporlensReport';

const DECK = {
  verified: 'Steam Deck Verified',
  playable: 'Steam Deck Playable',
  unsupported: 'Unsupported on Steam Deck',
};

// steam's colors for positive, mixed and negative reviews
function reviewColor(percentPositive: number) {
  if (percentPositive >= 70) return '#66c0f4';
  if (percentPositive >= 40) return '#b9a074';
  return '#a34c25';
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

function Details({
  appid,
  game,
  report,
  onOpenImage,
  onOpenMedia,
}: {
  appid: number;
  game: GameDetails;
  /** null when VaporLens hasn't analyzed the game (or isn't reachable) */
  report: Report | null;
  onOpenImage: (url: string) => void;
  onOpenMedia: (media: MediaItem[]) => void;
}) {
  // pages cached before trailers were loaded have none
  const media = [...(game.trailers ?? []), ...game.screenshots];
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
      {game.shortDescription !== '' && (
        <Text style={styles.lead}>{game.shortDescription}</Text>
      )}
      {media.length > 0 && (
        <View style={styles.media}>
          <Pressable
            onPress={() => onOpenMedia(media)}
            style={({ pressed }) => [
              styles.mediaHeader,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.mediaCount}>{mediaCount(media)}</Text>
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.accent} />
          </Pressable>
          <FlatList
            horizontal
            data={media}
            keyExtractor={(item) => item.url}
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.screenshots}
            renderItem={({ item }) => (
              <MediaTile
                item={item}
                style={styles.screenshot}
                onOpenImage={onOpenImage}
              />
            )}
          />
        </View>
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
      {game.description.length > 0 && (
        <>
          <SectionTitle title="About this game" style={styles.section} />
          <RichText blocks={game.description} onOpenImage={onOpenImage} />
        </>
      )}
    </>
  );
}

/** A game's store page: price, reviews, facts, trailers, screenshots and its description. */
export function GameScreen({
  voice,
  item,
  onBack,
  onOpenImage,
  onOpenMedia,
}: {
  voice: SteamVoice;
  /** shown right away, the rest of the page loads */
  item: StoreItem & { appid: number };
  onBack: () => void;
  onOpenImage: (url: string) => void;
  onOpenMedia: (media: MediaItem[]) => void;
}) {
  const loadGame = useCallback(
    () => voice.connection.feeds.getGame(item.appid),
    [voice, item.appid],
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
          appid={item.appid}
          game={game}
          report={report}
          onOpenImage={onOpenImage}
          onOpenMedia={onOpenMedia}
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
  muted: { color: colors.muted, fontSize: 13 },
  loading: { marginTop: 24 },
  reviews: { color: colors.muted, fontSize: 14 },
  facts: { gap: 6 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 90, color: colors.muted, fontSize: 13 },
  factValue: { flex: 1, color: colors.text, fontSize: 13 },
  tags: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  media: { gap: 8 },
  mediaHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.6 },
  mediaCount: { flex: 1, color: colors.muted, fontSize: 13 },
  seeAll: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  screenshots: { gap: 8, paddingHorizontal: 16 },
  screenshot: { height: 124, aspectRatio: 16 / 9, borderRadius: 6 },
  lead: { color: colors.bright, fontSize: 15, lineHeight: 22 },
  section: { marginTop: 8 },
});
