import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
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
import { DetailPage } from '../components/DetailPage';
import { GradientButton } from '../components/GradientButton';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { date, fullDate } from '../format';
import { openLink } from '../links';
import { colors, gradients } from '../theme';
import {
  getVaporlensReport,
  type VaporlensReport as Report,
  vaporlensUrl,
} from '../vaporlens';
import { Price } from './FeedCards';
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
}: {
  appid: number;
  game: GameDetails;
  /** null when VaporLens hasn't analyzed the game (or isn't reachable) */
  report: Report | null;
  onOpenImage: (url: string) => void;
}) {
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
      <View style={styles.facts}>
        <Fact
          label="Release date"
          value={game.releasedAt ? fullDate(game.releasedAt) : ''}
        />
        <Fact label="Developer" value={game.developers.join(', ')} />
        <Fact label="Publisher" value={game.publishers.join(', ')} />
        <Fact label="Platforms" value={game.platforms.join(', ')} />
        <Fact
          label="Steam Deck"
          value={game.steamDeck ? DECK[game.steamDeck] : ''}
        />
      </View>
      {game.tags.length > 0 && (
        <View style={styles.tags}>
          {game.tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      )}
      {game.screenshots.length > 0 && (
        <FlatList
          horizontal
          data={game.screenshots}
          keyExtractor={(shot) => shot.url}
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.screenshots}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpenImage(item.url)}>
              <Image
                source={item.thumbnailUrl}
                style={styles.screenshot}
                contentFit="cover"
              />
            </Pressable>
          )}
        />
      )}
      {game.shortDescription !== '' && (
        <Text style={styles.lead}>{game.shortDescription}</Text>
      )}
      {report && (
        <VaporlensReport
          report={report}
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

/** A game's store page: price, reviews, facts, screenshots and its description. */
export function GameScreen({
  voice,
  item,
  onBack,
  onOpenImage,
}: {
  voice: SteamVoice;
  /** shown right away, the rest of the page loads */
  item: StoreItem & { appid: number };
  onBack: () => void;
  onOpenImage: (url: string) => void;
}) {
  const [game, setGame] = useState<GameDetails | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setGame(null);
    setReport(null);
    setError(null);
    voice.connection.feeds.getGame(item.appid).then(
      (details) => current && setGame(details),
      (err: Error) => current && setError(err.message),
    );
    // the page works without it, failing to get it just leaves it out
    getVaporlensReport(item.appid).then(
      (found) => current && setReport(found),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [voice, item.appid]);

  // the list's item until the page has loaded, its prices are the same
  const shown = game ?? item;
  return (
    <DetailPage
      title={item.name}
      steamUrl={item.url}
      onBack={onBack}
      imageUrl={shown.imageUrl}
      imageRatio={460 / 215}
    >
      <Text style={styles.name}>{shown.name}</Text>
      <View style={styles.buy}>
        <View style={styles.grow}>
          <Price item={shown} />
          {shown.discountEndsAt && (
            <Text style={styles.muted}>
              Offer ends {date(shown.discountEndsAt)}
            </Text>
          )}
        </View>
        <GradientButton
          title="Open in Steam"
          gradient={gradients.accept}
          onPress={() => openLink(item.url)}
        />
      </View>
      {game ? (
        <Details
          appid={item.appid}
          game={game}
          report={report}
          onOpenImage={onOpenImage}
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
  name: { color: colors.bright, fontSize: 24, fontWeight: '800' },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 4 },
  muted: { color: colors.muted, fontSize: 13 },
  loading: { marginTop: 24 },
  reviews: { color: colors.muted, fontSize: 14 },
  facts: {
    gap: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 90, color: colors.muted, fontSize: 13 },
  factValue: { flex: 1, color: colors.text, fontSize: 13 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    color: colors.online,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(103, 193, 245, 0.12)',
  },
  screenshots: { gap: 8, paddingHorizontal: 16 },
  screenshot: { height: 124, aspectRatio: 16 / 9, borderRadius: 6 },
  lead: { color: colors.bright, fontSize: 15, lineHeight: 22 },
  section: { marginTop: 8 },
});
