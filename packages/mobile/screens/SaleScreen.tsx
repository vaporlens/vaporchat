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
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { SaleSection, SteamEvent, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailHeader, useScrolledPast } from '../components/DetailHeader';
import { useScrollWatch } from '../components/onScreen';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { fullDate } from '../format';
import { colors, imageFadeMs } from '../theme';
import { StoreItemCard } from './FeedCards';

type Section = SaleSection & { key: string; data: StoreItem[] };

const HERO_RATIO = 16 / 9;

/** A sale event: its picture and texts, and the games of each of its sections. */
export function SaleScreen({
  voice,
  event,
  onBack,
  onOpenGame,
  onOpenImage,
}: {
  voice: SteamVoice;
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
    () => voice.connection.feeds.getSalePage(event.id),
    [voice, event.id],
  );
  const { data: page, error } = useCached(`sale-${event.id}`, loadPage);
  const sections = useMemo(
    () =>
      page?.map(
        (section, index): Section => ({
          ...section,
          key: `${index}`,
          data: section.items,
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
      <scroll.Provider value={scroll.listeners}>
        <SectionList<StoreItem, Section>
          sections={sections ?? []}
          onScroll={(scrolled) => {
            scroll.onScroll();
            pastHero.onScroll(scrolled);
          }}
          scrollEventThrottle={100}
          keyExtractor={(item, index) => `${item.url}-${index}`}
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
          renderItem={({ item }) => (
            <StoreItemCard
              item={item}
              show="discountEnds"
              onPress={() => onOpenGame(item)}
            />
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
  sectionHeader: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
});
