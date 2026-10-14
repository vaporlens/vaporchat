import { Image } from 'expo-image';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SaleSection, SteamEvent, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailHeader, useScrolledPast } from '../components/DetailHeader';
import { useScrollWatch } from '../components/onScreen';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { fullDate } from '../format';
import { colors, gridGutter, imageFadeMs } from '../theme';
import { gridRows, StoreItemCard } from './FeedCards';

// its games two to a row, a section list can't lay out columns
type Section = SaleSection & { key: string; data: StoreItem[][] };

const HERO_RATIO = 16 / 9;

/** A sale event: its picture and texts, and the games of each of its sections. */
export function SaleScreen({
  feeds,
  event,
  onBack,
  onOpenGame,
  onOpenImage,
}: {
  feeds: SteamFeeds;
  event: SteamEvent;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
  onOpenImage: (url: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useScrollWatch();
  // its title is under the picture, the header shows it once that scrolled away
  const pastHero = useScrolledPast(event.imageUrl ? width / HERO_RATIO : 0);
  const loadPage = useCallback(
    () => feeds.getSalePage(event.id),
    [feeds, event.id],
  );
  const { data: page, error } = useCached(`sale-${event.id}`, loadPage);
  const sections = useMemo(
    () =>
      page?.map(
        (section, index): Section => ({
          ...section,
          key: `${index}`,
          data: gridRows(section.items),
        }),
      ) ?? null,
    [page],
  );

  return (
    <View style={styles.screen}>
      <DetailHeader
        title={event.title}
        subtitle={event.endsAt ? `Until ${fullDate(event.endsAt)}` : undefined}
        onBack={onBack}
        steamUrl={event.url}
        titleShown={pastHero.past}
      />
      <scroll.Provider value={scroll.watch}>
        <SectionList<StoreItem[], Section>
          sections={sections ?? []}
          onScroll={(scrolled) => {
            scroll.onScroll();
            pastHero.onScroll(scrolled);
          }}
          scrollEventThrottle={100}
          keyExtractor={(row, index) => `${row[0].url}-${index}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View style={styles.intro}>
              {event.imageUrl && (
                <Image
                  source={event.imageUrl}
                  transition={imageFadeMs}
                  style={styles.hero}
                  contentFit="cover"
                />
              )}
              <Text style={styles.title}>{event.title}</Text>
              {event.summary !== '' && (
                <Text style={styles.summary}>{event.summary}</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            error ? (
              <Text style={styles.message}>{error}</Text>
            ) : sections ? (
              <Text style={styles.message}>This sale lists no games.</Text>
            ) : (
              <ActivityIndicator color={colors.muted} style={styles.message} />
            )
          }
          renderSectionHeader={({ section }) =>
            section.title !== '' || section.body.length > 0 ? (
              <View style={styles.sectionHeader}>
                {section.title !== '' && <SectionTitle title={section.title} />}
                {section.body.length > 0 && (
                  <RichText blocks={section.body} onOpenImage={onOpenImage} />
                )}
              </View>
            ) : null
          }
          renderItem={({ item: row }) => (
            <View style={styles.row}>
              {row.map((item) => (
                <StoreItemCard
                  key={item.url}
                  item={item}
                  show="discountEnds"
                  onPress={onOpenGame}
                />
              ))}
            </View>
          )}
        />
      </scroll.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  intro: { gap: 12, paddingBottom: 4 },
  hero: { width: '100%', aspectRatio: HERO_RATIO },
  title: {
    color: colors.bright,
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 16,
  },
  summary: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
  row: { flexDirection: 'row', paddingHorizontal: gridGutter },
  sectionHeader: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
});
