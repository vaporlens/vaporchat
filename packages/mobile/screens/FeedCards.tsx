import { Image } from 'expo-image';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type {
  Friend,
  FriendActivity,
  FriendActivityKind,
  SteamEvent,
  StoreItem,
} from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { date, fullDate, timeAgo } from '../format';
import { colors } from '../theme';

// the store's event carousel takes this much of the screen's height
const CAROUSEL_SHARE = 0.2;
const CAROUSEL_GAP = 10;

export function Price({ item }: { item: StoreItem }) {
  if (item.free) return <Text style={styles.price}>Free</Text>;
  if (!item.price) return null;
  if (!item.originalPrice)
    return <Text style={styles.price}>{item.price}</Text>;
  return (
    <View style={styles.priceRow}>
      <Text style={styles.discount}>-{item.discountPercent}%</Text>
      <View>
        <Text style={styles.original}>{item.originalPrice}</Text>
        <Text style={styles.final}>{item.price}</Text>
      </View>
    </View>
  );
}

/** A game with its price. When it was or will be released, or when its discount ends. */
export function StoreItemCard({
  item,
  show,
  onPress,
}: {
  item: StoreItem;
  show: 'released' | 'discountEnds';
  onPress: () => void;
}) {
  const detail =
    show === 'released'
      ? item.releasedAt &&
        (item.releasedAt > Date.now()
          ? `Releases ${fullDate(item.releasedAt)}`
          : `Released ${date(item.releasedAt)}`)
      : item.discountEndsAt && `Offer ends ${date(item.discountEndsAt)}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image source={item.imageUrl} style={styles.header} contentFit="cover" />
      <View style={styles.grow}>
        <Text style={styles.title} numberOfLines={2}>
          {item.name}
        </Text>
        {detail ? <Text style={styles.sub}>{detail}</Text> : null}
        <Price item={item} />
      </View>
    </Pressable>
  );
}

/** `Until Oct 12` while it runs, otherwise when it was posted. */
function when(event: SteamEvent) {
  return event.endsAt &&
    event.endsAt > Date.now() &&
    event.startsAt < Date.now()
    ? `Until ${date(event.endsAt)}`
    : timeAgo(event.startsAt);
}

/** Sale events side by side, swiped through. */
export function EventCarousel({
  events,
  onOpen,
}: {
  events: SteamEvent[];
  onOpen: (event: SteamEvent) => void;
}) {
  const window = useWindowDimensions();
  const height = Math.round(window.height * CAROUSEL_SHARE);
  // the 16:9 capsules, or nearly the screen's width when that's narrower
  const width = Math.min(Math.round((height * 16) / 9), window.width - 48);
  return (
    <FlatList
      horizontal
      data={events}
      keyExtractor={(event) => event.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + CAROUSEL_GAP}
      decelerationRate="fast"
      contentContainerStyle={styles.carousel}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item)}
          style={({ pressed }) => [
            styles.slide,
            { width, height },
            pressed && styles.pressed,
          ]}
        >
          <Image
            source={item.imageUrl}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <View style={styles.slideText}>
            <Text style={styles.slideTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.slideWhen}>{when(item)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

/** A sale or news post: its picture, title and the start of its text. */
export function EventCard({
  event,
  onPress,
}: {
  event: SteamEvent;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
    >
      {event.imageUrl && (
        <Image
          source={event.imageUrl}
          style={styles.capsule}
          contentFit="cover"
        />
      )}
      <View style={styles.eventBody}>
        <Text style={styles.sub} numberOfLines={1}>
          {event.game ? `${event.game} · ${when(event)}` : when(event)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {event.summary !== '' && (
          <Text style={styles.summary} numberOfLines={3}>
            {event.summary}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function plural(count: number, word: string) {
  return count === 1 ? `1 ${word}` : `${count} ${word}s`;
}

const DOING: Record<
  FriendActivityKind,
  (activity: FriendActivity, game: string, target: string) => string
> = {
  friendAdded: (_a, _g, target) => `is now friends with ${target}`,
  achievement: (a, game) =>
    `unlocked ${plural(Math.max(1, a.achievements.length), 'achievement')} in ${game}`,
  purchase: (_a, game) => `now owns ${game}`,
  wishlist: (_a, game) => `wishlisted ${game}`,
  review: (_a, game) => `reviewed ${game}`,
  screenshot: (_a, game) => `shared a screenshot of ${game}`,
  video: (_a, game) => `shared a video of ${game}`,
  workshop: (_a, game) => `published a workshop item for ${game}`,
  favorited: (_a, game) => `favorited a workshop item for ${game}`,
  firstPlay: (_a, game) => `played ${game} for the first time`,
};

/** One thing a friend did: who, what, when, and the game. */
export function ActivityRow({
  activity,
  user,
  onPress,
  onOpenGame,
}: {
  activity: FriendActivity;
  /** a person's name and avatar */
  user: (steamid: string) => Friend;
  onPress: () => void;
  onOpenGame: (game: StoreItem) => void;
}) {
  const { game } = activity;
  const actor = user(activity.actor);
  const target = activity.target ? user(activity.target).name : 'someone';
  const doing = DOING[activity.kind](
    activity,
    activity.game?.name ?? 'a game',
    target,
  );
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.activity, pressed && styles.pressed]}
    >
      <Avatar url={actor.avatarUrl} name={actor.name} size={40} />
      <View style={styles.grow}>
        <Text style={styles.text}>
          <Text style={styles.actor}>{actor.name}</Text> {doing}
        </Text>
        {activity.achievements.length > 0 && (
          <View style={styles.achievements}>
            {activity.achievements.map((achievement) => (
              <Image
                key={achievement.name}
                source={achievement.iconUrl}
                style={styles.achievement}
                accessibilityLabel={achievement.name}
              />
            ))}
          </View>
        )}
        <Text style={styles.sub}>{timeAgo(activity.time)}</Text>
      </View>
      {game?.imageUrl && (
        <Pressable
          onPress={() => onOpenGame(game)}
          accessibilityLabel={game.name}
          hitSlop={6}
        >
          <Image
            source={game.imageUrl}
            style={styles.gameThumb}
            contentFit="cover"
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  grow: { flex: 1, gap: 4 },
  // steam's 460x215 header pictures
  header: {
    width: 128,
    aspectRatio: 460 / 215,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
  },
  title: { color: colors.bright, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12 },
  price: { color: colors.text, fontSize: 14, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discount: {
    color: colors.discount,
    backgroundColor: colors.discountBackground,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  original: {
    color: colors.muted,
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  final: { color: colors.discount, fontSize: 14, fontWeight: '600' },
  carousel: { gap: CAROUSEL_GAP, paddingHorizontal: 12, paddingBottom: 4 },
  slide: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'flex-end',
  },
  slideText: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 10,
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%)',
  },
  slideTitle: { color: colors.bright, fontSize: 15, fontWeight: '700' },
  slideWhen: { color: colors.text, fontSize: 12, marginTop: 2 },
  eventCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  capsule: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceRaised,
  },
  eventBody: { padding: 12, gap: 4 },
  summary: { color: colors.text, fontSize: 14, lineHeight: 19 },
  activity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { color: colors.text, fontSize: 14, lineHeight: 19 },
  actor: { color: colors.online, fontWeight: '700' },
  achievements: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  achievement: { width: 32, height: 32, borderRadius: 4 },
  gameThumb: {
    width: 92,
    aspectRatio: 460 / 215,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
  },
});
