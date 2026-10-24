import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { ChatPart, StoreItem } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { openLink } from '../links';
import { colors } from '../theme';
import { Price } from './FeedCards';

export type PreviewPart = Extract<
  ChatPart,
  { kind: 'storeLink' | 'webPreview' | 'youtube' }
>;

const WIDTH = 260;

/** The address's site, how a preview without a picture says where it goes. */
function site(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
}

/** A store page's game: picture, name and price, opening its page in the app. The link until loaded. */
function StoreLinkPreview({
  feeds,
  part,
  onOpenGame,
  onLongPress,
}: {
  feeds: SteamFeeds;
  part: Extract<PreviewPart, { kind: 'storeLink' }>;
  onOpenGame: (item: StoreItem) => void;
  onLongPress?: () => void;
}) {
  const load = useCallback(
    () => feeds.getStoreItems([part.appid]),
    [feeds, part.appid],
  );
  const game = useCached(`store-item-${part.appid}`, load).data?.[0];
  return (
    <Pressable
      onPress={() => (game ? onOpenGame(game) : openLink(part.url))}
      onLongPress={onLongPress}
      accessibilityRole="link"
      accessibilityLabel={game?.name ?? part.url}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {game ? (
        <>
          <Image
            source={game.imageUrl}
            style={styles.storeImage}
            contentFit="cover"
          />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {game.name}
            </Text>
            <Price item={game} />
          </View>
        </>
      ) : (
        <Text style={[styles.body, styles.link]} numberOfLines={2}>
          {part.url}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A link Steam previews under a message: a store page's game, a web page's title, text and picture,
 * a YouTube video's frame. Held down, it reacts to the message like the rest of the bubble. News
 * posts show their store pages' games with it too.
 */
export function LinkPreview({
  feeds,
  part,
  onOpenGame,
  onLongPress,
}: {
  feeds: SteamFeeds;
  part: PreviewPart;
  onOpenGame: (item: StoreItem) => void;
  onLongPress?: () => void;
}) {
  if (part.kind === 'storeLink') {
    return (
      <StoreLinkPreview
        feeds={feeds}
        part={part}
        onOpenGame={onOpenGame}
        onLongPress={onLongPress}
      />
    );
  }
  const youtube = part.kind === 'youtube';
  const imageUrl = youtube
    ? `https://i.ytimg.com/vi/${encodeURIComponent(part.videoId)}/hqdefault.jpg`
    : part.imageUrl;
  return (
    <Pressable
      onPress={() => openLink(part.url)}
      onLongPress={onLongPress}
      accessibilityRole="link"
      accessibilityLabel={youtube ? 'YouTube video' : part.title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {imageUrl && (
        <View>
          <Image source={imageUrl} style={styles.image} contentFit="cover" />
          {youtube && (
            <View style={styles.play}>
              <Ionicons name="play-circle" size={48} color={colors.bright} />
            </View>
          )}
        </View>
      )}
      <View style={styles.body}>
        {!youtube && (
          <>
            <Text style={styles.title} numberOfLines={2}>
              {part.title}
            </Text>
            {part.description !== '' && (
              <Text style={styles.description} numberOfLines={3}>
                {part.description}
              </Text>
            )}
          </>
        )}
        <Text style={styles.site} numberOfLines={1}>
          {youtube ? 'YouTube' : site(part.url)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: WIDTH,
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  // store headers are 460×215
  storeImage: { width: '100%', aspectRatio: 460 / 215 },
  image: { width: '100%', aspectRatio: 16 / 9 },
  play: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: 4, padding: 10 },
  title: { color: colors.bright, fontSize: 15, fontWeight: '600' },
  description: { color: colors.text, fontSize: 13 },
  site: { color: colors.muted, fontSize: 12 },
  link: { color: colors.text, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
});
