import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SteamEvent, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { DetailPage } from '../components/DetailPage';
import { RichText } from '../components/RichText';
import { fullDate } from '../format';
import { colors } from '../theme';

/** The game a post is about, opening its page. Nothing until it's loaded, or for group posts. */
function GameLink({
  feeds,
  appid,
  onOpenGame,
}: {
  feeds: SteamFeeds;
  appid: number;
  onOpenGame: (item: StoreItem) => void;
}) {
  const load = useCallback(() => feeds.getStoreItems([appid]), [feeds, appid]);
  const game = useCached(`store-item-${appid}`, load).data?.[0];
  if (!game) return null;
  return (
    <Pressable
      onPress={() => onOpenGame(game)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.game, pressed && styles.pressed]}
    >
      <Ionicons
        name="game-controller-outline"
        size={18}
        color={colors.accent}
      />
      <Text style={styles.gameName} numberOfLines={1}>
        {game.name}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** A whole news post: its picture, title and text, and the game it's about. */
export function ArticleScreen({
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
  return (
    <DetailPage
      title={event.game ?? 'News'}
      subtitle={fullDate(event.startsAt)}
      steamUrl={event.url}
      onBack={onBack}
      imageUrl={event.imageUrl}
      imageRatio={16 / 9}
    >
      <Text style={styles.title}>{event.title}</Text>
      {event.appid !== null && (
        <GameLink feeds={feeds} appid={event.appid} onOpenGame={onOpenGame} />
      )}
      <RichText blocks={event.body} onOpenImage={onOpenImage} />
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.bright, fontSize: 22, fontWeight: '800' },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gameName: { flex: 1, color: colors.bright, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
