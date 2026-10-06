import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { StoreItem } from 'vaporchat/protocol';
import { DetailPage } from '../components/DetailPage';
import { colors } from '../theme';
import { BuyHeader, StoreItemCard } from './FeedCards';

/** A bundle: its picture and price, and the games in it. */
export function BundleScreen({
  voice,
  item,
  onBack,
  onOpenGame,
}: {
  voice: SteamVoice;
  item: StoreItem;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
}) {
  const [games, setGames] = useState<StoreItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    voice.connection.feeds.getStoreItems(item.includedAppids).then(
      (found) => current && setGames(found),
      (err: Error) => current && setError(err.message),
    );
    return () => {
      current = false;
    };
  }, [voice, item.includedAppids]);

  return (
    <DetailPage
      title={item.name}
      steamUrl={item.url}
      onBack={onBack}
      imageUrl={item.imageUrl}
      imageRatio={460 / 215}
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
              onPress={() => onOpenGame(game)}
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
  // the cards have their own margins, edge to edge inside the padded page
  games: { marginHorizontal: -16 },
  muted: { color: colors.muted, fontSize: 13 },
  loading: { marginTop: 24 },
});
