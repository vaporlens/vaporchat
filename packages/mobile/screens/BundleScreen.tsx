import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailPage } from '../components/DetailPage';
import { colors, gridGutter } from '../theme';
import { BuyHeader, StoreItemCard } from './FeedCards';

/** A bundle: its picture and price, and the games in it. */
export function BundleScreen({
  feeds,
  item,
  onBack,
  onOpenGame,
}: {
  feeds: SteamFeeds;
  item: StoreItem;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
}) {
  const loadGames = useCallback(
    () => feeds.getStoreItems(item.includedAppids),
    [feeds, item.includedAppids],
  );
  // its store page names it, bundles have no appid
  const { data: games, error } = useCached(`bundle-${item.url}`, loadGames);

  return (
    <DetailPage
      title={item.name}
      steamUrl={item.url}
      onBack={onBack}
      imageUrl={item.imageUrl}
      imageRatio={460 / 215}
      titleInContent
    >
      <BuyHeader item={item} />
      {games?.length === 0 ? (
        <Text style={styles.muted}>This bundle lists no games.</Text>
      ) : games ? (
        // a bundle has a handful of games, no need for a virtualized list
        <View style={styles.games}>
          {games.map((game) => (
            <StoreItemCard
              key={game.url}
              item={game}
              show="released"
              onPress={onOpenGame}
            />
          ))}
        </View>
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : (
        <ActivityIndicator color={colors.muted} style={styles.loading} />
      )}
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  // a grid as wide as the page, its cards pad themselves by the gutter
  games: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -16 + gridGutter,
  },
  muted: { color: colors.muted, fontSize: 13 },
  loading: { marginTop: 24 },
});
