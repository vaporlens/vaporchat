import { Image } from 'expo-image';
import { type ReactNode, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { GameDetails, Requirements, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { openLink } from '../links';
import { colors, gridGutter, imageFadeMs } from '../theme';
import { Price, StoreItemCard } from './FeedCards';
import { PagedList } from './PagedList';

const DLC_PAGE_SIZE = 50;

/** That the game isn't finished, over its overview like the store page has it. */
export function EarlyAccessNotice({ answered }: { answered: boolean }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Early Access game</Text>
      <Text style={styles.noticeText}>
        Not complete, and may or may not change further.
        {answered && ' Its developers say why under About.'}
      </Text>
    </View>
  );
}

/** What the developers say about Early Access, question by question. */
export function EarlyAccessAnswers({
  answers,
  onOpenImage,
}: {
  answers: NonNullable<GameDetails['earlyAccess']>;
  onOpenImage: (url: string) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionTitle title="Early Access" />
      {answers.map(({ question, answer }) => (
        <View key={question} style={styles.answer}>
          <Text style={styles.question}>{question}</Text>
          <RichText blocks={answer} onOpenImage={onOpenImage} />
        </View>
      ))}
    </View>
  );
}

/** Each way to buy the game, with its price. */
export function Editions({ editions }: { editions: GameDetails['editions'] }) {
  return (
    <View style={styles.section}>
      <SectionTitle title="Editions" />
      {editions.map((edition) => (
        <View key={edition.name} style={styles.edition}>
          <Text style={styles.editionName}>{edition.name}</Text>
          <Price item={edition} />
        </View>
      ))}
    </View>
  );
}

/** The game's website and its pages elsewhere, opened in the browser. */
export function Links({ links }: { links: GameDetails['links'] }) {
  return (
    <View style={styles.section}>
      <SectionTitle title="Links" />
      <View style={styles.pills}>
        {links.map((link) => (
          <Pressable
            key={link.url}
            onPress={() => openLink(link.url)}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Text style={styles.pillText}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Tier({
  title,
  requirements,
  onOpenImage,
}: {
  title: string;
  requirements: Requirements | null;
  onOpenImage: (url: string) => void;
}) {
  if (!requirements) return null;
  return (
    <View style={styles.tier}>
      <Text style={styles.question}>{title}</Text>
      {requirements.rows.map(({ label, value }) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
      <RichText blocks={requirements.text} onOpenImage={onOpenImage} />
    </View>
  );
}

/** Minimum and recommended specs, per platform. */
export function SystemRequirementsList({
  requirements,
  onOpenImage,
}: {
  requirements: GameDetails['requirements'];
  onOpenImage: (url: string) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionTitle title="System requirements" />
      {requirements.map(({ platform, minimum, recommended }) => (
        <View key={platform} style={styles.answer}>
          <Text style={styles.platform}>{platform}</Text>
          <Tier
            title="Minimum"
            requirements={minimum}
            onOpenImage={onOpenImage}
          />
          <Tier
            title="Recommended"
            requirements={recommended}
            onOpenImage={onOpenImage}
          />
        </View>
      ))}
    </View>
  );
}

function DlcRow({
  item,
  onPress,
}: {
  item: StoreItem;
  onPress: (item: StoreItem) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.dlc, pressed && styles.pressed]}
    >
      <Image
        source={item.imageUrl}
        transition={imageFadeMs}
        style={styles.dlcImage}
        contentFit="cover"
      />
      <Text style={styles.dlcName} numberOfLines={2}>
        {item.name}
      </Text>
      <Price item={item} />
    </Pressable>
  );
}

/** The game's DLC as rows, the next ones loading once scrolled to the end. */
export function GameDlc({
  feeds,
  appid,
  dlc,
  onOpenGame,
  onError,
}: {
  feeds: SteamFeeds;
  appid: number;
  dlc: number[];
  onOpenGame: (item: StoreItem) => void;
  onError: (err: Error) => void;
}) {
  const load = useCallback(
    async (start: number | null) => {
      const from = start ?? 0;
      const to = from + DLC_PAGE_SIZE;
      return {
        items: await feeds.getStoreItems(dlc.slice(from, to)),
        next: to < dlc.length ? to : null,
      };
    },
    [feeds, dlc],
  );
  return (
    <PagedList
      load={load}
      keyOf={(item) => item.url}
      cacheKey={`dlc-${appid}`}
      empty="No DLC"
      renderItem={(item) => <DlcRow item={item} onPress={onOpenGame} />}
      onError={onError}
    />
  );
}

/** Games like this one, two to a row: VaporLens's first when it analyzed the game, then Steam's. */
export function SimilarGames({
  feeds,
  appid,
  vaporlensSimilar,
  onOpenGame,
}: {
  feeds: SteamFeeds;
  appid: number;
  /** appids from VaporLens's report, closest first */
  vaporlensSimilar: number[] | undefined;
  onOpenGame: (item: StoreItem) => void;
}) {
  const load = useCallback(() => feeds.getSimilarGames(appid), [feeds, appid]);
  const { data: games, error } = useCached(`similar-${appid}`, load);
  // a string: the report's list is a new array each time it loads
  const ids = vaporlensSimilar?.join(',') ?? '';
  const loadVaporlens = useCallback(
    async () => (ids ? feeds.getStoreItems(ids.split(',').map(Number)) : []),
    [feeds, ids],
  );
  // failing leaves Steam's alone
  const { data: vaporlensGames } = useCached(
    `vaporlens-similar-${appid}`,
    loadVaporlens,
  );
  const ours = vaporlensGames ?? [];
  const shownAbove = new Set(ours.map((game) => game.appid));
  const grid = (items: StoreItem[]) => (
    <View style={styles.grid}>
      {items.map((game) => (
        <StoreItemCard
          key={game.url}
          item={game}
          show="released"
          onPress={onOpenGame}
        />
      ))}
    </View>
  );

  let steam: ReactNode;
  if (!games) {
    steam = error ? (
      <Text style={styles.muted}>{error}</Text>
    ) : (
      <ActivityIndicator color={colors.muted} style={styles.loading} />
    );
  } else if (games.length === 0) {
    steam = <Text style={styles.muted}>Steam suggests no games like it</Text>;
  } else {
    steam = grid(games.filter((game) => !shownAbove.has(game.appid)));
  }
  if (ours.length === 0) return steam;
  return (
    <>
      <SectionTitle title="Similar by reviews" />
      {grid(ours)}
      {/* none left once VaporLens's are taken out */}
      {games?.some((game) => !shownAbove.has(game.appid)) !== false && (
        <>
          <SectionTitle title="Similar on Steam" />
          {steam}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  muted: { color: colors.muted, fontSize: 13 },
  loading: { marginTop: 24 },
  pressed: { opacity: 0.7 },
  notice: {
    gap: 4,
    padding: 12,
    borderRadius: 6,
    backgroundColor: colors.accentBackground,
  },
  noticeTitle: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  answer: { gap: 6 },
  question: { color: colors.bright, fontSize: 14, fontWeight: '700' },
  edition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  editionName: { flex: 1, color: colors.text, fontSize: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.accentBackground,
  },
  pillText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  platform: { color: colors.bright, fontSize: 16, fontWeight: '700' },
  tier: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  rowLabel: { width: 90, color: colors.muted, fontSize: 13 },
  rowValue: { flex: 1, color: colors.text, fontSize: 13 },
  dlc: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // steam's 460x215 header pictures, small
  dlcImage: {
    width: 92,
    height: 43,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
  },
  dlcName: { flex: 1, color: colors.text, fontSize: 14 },
  // a grid as wide as the page, its cards pad themselves by the gutter
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -16 + gridGutter,
  },
});
