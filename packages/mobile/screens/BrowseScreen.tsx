import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactElement, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type {
  StoreBrowse,
  StoreHub,
  StoreItem,
  StoreTag,
} from 'vaporchat/protocol';
import { browseUrl } from 'vaporchat/steam/store';
import { useCached } from '../cache';
import { DetailHeader } from '../components/DetailHeader';
import type { IconName } from '../components/RoundButton';
import { SectionTitle } from '../components/SectionTitle';
import { colors } from '../theme';
import { Feed } from './Feed';
import { StoreItemCard } from './FeedCards';
import type { Page } from './PageScreen';

const HUBS: { hub: StoreHub; title: string; icon: IconName }[] = [
  { hub: 'freeToPlay', title: 'Free to Play', icon: 'gift-outline' },
  { hub: 'demos', title: 'Demos', icon: 'play-circle-outline' },
  { hub: 'earlyAccess', title: 'Early Access', icon: 'construct-outline' },
  { hub: 'vr', title: 'VR', icon: 'glasses-outline' },
  {
    hub: 'deck',
    title: 'Steam Deck Verified',
    icon: 'checkmark-circle-outline',
  },
];

function browseTitle(browse: StoreBrowse) {
  return browse.kind === 'tag'
    ? browse.tag.name
    : HUBS.find(({ hub }) => hub === browse.hub)!.title;
}

const storeItemKey = (item: StoreItem) => item.url;

/** A tag to browse the store's games by. */
export function TagChip({
  tag,
  onOpenPage,
}: {
  tag: StoreTag;
  onOpenPage: (page: Page) => void;
}) {
  return (
    <Pressable
      onPress={() =>
        onOpenPage({ kind: 'browse', browse: { kind: 'tag', tag } })
      }
      accessibilityRole="button"
      accessibilityHint="Shows games with this tag"
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.chipText}>{tag.name}</Text>
    </Pressable>
  );
}

/** The Store tab's hubs and tags, each opening its games. */
export function BrowseTab({
  feeds,
  header,
  onOpenPage,
}: {
  feeds: SteamFeeds;
  header: ReactElement;
  onOpenPage: (page: Page) => void;
}) {
  const loadTags = useCallback(() => feeds.getPopularTags(), [feeds]);
  const { data: tags, error } = useCached('popular-tags', loadTags);
  return (
    <ScrollView contentContainerStyle={styles.tab}>
      {header}
      <View style={styles.section}>
        <View style={styles.hubs}>
          {HUBS.map(({ hub, title, icon }) => (
            <Pressable
              key={hub}
              onPress={() =>
                onOpenPage({ kind: 'browse', browse: { kind: 'hub', hub } })
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.hub, pressed && styles.pressed]}
            >
              <Ionicons name={icon} size={22} color={colors.accent} />
              <Text style={styles.hubTitle}>{title}</Text>
            </Pressable>
          ))}
        </View>
        <SectionTitle title="Popular tags" />
        {tags ? (
          <View style={styles.chips}>
            {tags.map((tag) => (
              <TagChip key={tag.tagid} tag={tag} onOpenPage={onOpenPage} />
            ))}
          </View>
        ) : error ? (
          <Text style={styles.muted}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.muted} />
        )}
      </View>
    </ScrollView>
  );
}

/** A hub's or tag's games, most popular first. */
export function BrowseScreen({
  feeds,
  browse,
  onBack,
  onOpenGame,
  onError,
}: {
  feeds: SteamFeeds;
  browse: StoreBrowse;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
  onError: (err: Error) => void;
}) {
  const insets = useSafeAreaInsets();
  const load = useCallback(
    (next: number | null) => feeds.browseGames(browse, next),
    [feeds, browse],
  );
  const renderItem = useCallback(
    (item: StoreItem) => (
      <StoreItemCard item={item} show="released" onPress={onOpenGame} />
    ),
    [onOpenGame],
  );
  const id = browse.kind === 'tag' ? `tag-${browse.tag.tagid}` : browse.hub;
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <DetailHeader
        title={browseTitle(browse)}
        steamUrl={browseUrl(browse)}
        onBack={onBack}
      />
      <Feed
        cacheKey={`browse-${id}`}
        load={load}
        keyOf={storeItemKey}
        columns={2}
        renderItem={renderItem}
        empty="No games here."
        onError={onError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tab: { paddingBottom: 16 },
  section: { gap: 14, paddingHorizontal: 16 },
  hubs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexGrow: 1,
    flexBasis: '45%',
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hubTitle: { color: colors.bright, fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
  },
  chipText: { color: colors.text, fontSize: 13 },
  muted: { color: colors.muted, fontSize: 13 },
  pressed: { opacity: 0.6 },
});
