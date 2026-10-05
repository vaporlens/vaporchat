import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { SaleSection, SteamEvent, StoreItem } from 'vaporchat/protocol';
import { DetailHeader } from '../components/DetailHeader';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { fullDate } from '../format';
import { colors } from '../theme';
import { StoreItemCard } from './FeedCards';

type Section = SaleSection & { key: string; data: StoreItem[] };

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
  const [sections, setSections] = useState<Section[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    voice.connection.feeds.getSalePage(event.id).then(
      (page) =>
        current &&
        setSections(
          page.map((section, index) => ({
            ...section,
            key: `${index}`,
            data: section.items,
          })),
        ),
      (err: Error) => current && setError(err.message),
    );
    return () => {
      current = false;
    };
  }, [voice, event.id]);

  return (
    <View style={styles.screen}>
      <DetailHeader
        title={event.title}
        subtitle={event.endsAt ? `Until ${fullDate(event.endsAt)}` : undefined}
        onBack={onBack}
        steamUrl={event.url}
      />
      <SectionList<StoreItem, Section>
        sections={sections ?? []}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={styles.intro}>
            {event.imageUrl && (
              <Image
                source={event.imageUrl}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  intro: { gap: 12, paddingBottom: 4 },
  hero: { width: '100%', aspectRatio: 16 / 9 },
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
