import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  Friend,
  FriendActivity,
  FriendActivityKind,
  SteamEvent,
  StoreItem,
} from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { GradientButton } from '../components/GradientButton';
import { date, fullDate, timeAgo } from '../format';
import { openLink } from '../links';
import { colors, gradients, gridGutter, imageFadeMs } from '../theme';

/** Items two to a row, for lists that can't lay out columns themselves. */
export function gridRows<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

export function Price({ item }: { item: StoreItem }) {
  if (item.free) return <Text style={styles.price}>Free</Text>;
  if (!item.price) return null;
  if (!item.originalPrice)
    return <Text style={styles.price}>{item.price}</Text>;
  return (
    <View style={styles.priceRow}>
      <View style={styles.discount}>
        <Text style={styles.discountText}>-{item.discountPercent}%</Text>
      </View>
      <View style={styles.prices}>
        <Text style={styles.original}>{item.originalPrice}</Text>
        <Text style={styles.final}>{item.price}</Text>
      </View>
    </View>
  );
}

/** A game's or bundle's name over its price, and opening it on Steam to buy it. */
export function BuyHeader({ item }: { item: StoreItem }) {
  return (
    <>
      <Text style={styles.name}>{item.name}</Text>
      <View style={styles.buy}>
        <View style={styles.grow}>
          <Price item={item} />
          {item.discountEndsAt && (
            <Text style={styles.offerEnds}>
              Offer ends {date(item.discountEndsAt)}
            </Text>
          )}
        </View>
        <GradientButton
          title="Open in Steam"
          gradient={gradients.accept}
          onPress={() => openLink(item.url)}
        />
      </View>
    </>
  );
}

/**
 * A game with its price. When it was or will be released, or when its discount ends. Half a row
 * of a two-column grid, the rows pad themselves by `gridGutter`.
 */
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
    <View style={styles.cell}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View>
          <Image
            source={item.imageUrl}
            transition={imageFadeMs}
            style={styles.header}
            contentFit="cover"
          />
          <View style={styles.cardPrice}>
            <Price item={item} />
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text
            style={styles.cardTitle}
            numberOfLines={2}
            // no lone word on the second line
            lineBreakStrategyIOS="push-out"
          >
            {item.name}
          </Text>
          {detail ? (
            <Text style={styles.sub} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
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
          transition={imageFadeMs}
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
                transition={imageFadeMs}
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
            transition={imageFadeMs}
            style={styles.gameThumb}
            contentFit="cover"
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { width: '50%', padding: gridGutter },
  // stretches to the row, so both cards in it end level
  card: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  grow: { flex: 1, gap: 4 },
  // steam's 460x215 header pictures
  header: {
    width: '100%',
    aspectRatio: 460 / 215,
    backgroundColor: colors.surfaceRaised,
  },
  cardBody: { gap: 6, padding: 12 },
  // always two lines tall, so the dates under titles line up across a row
  cardTitle: {
    color: colors.bright,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    minHeight: 36,
  },
  // in the picture's corner, the way steam's store shows discounts
  cardPrice: { position: 'absolute', right: 6, bottom: 6 },
  title: { color: colors.bright, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12 },
  price: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  // steam's discount block: the percentage joined to the old and new price
  priceRow: { flexDirection: 'row', borderRadius: 4, overflow: 'hidden' },
  discount: {
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.discountBackground,
  },
  discountText: { color: colors.discount, fontSize: 16, fontWeight: '700' },
  prices: {
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surfaceRaised,
  },
  original: {
    color: colors.muted,
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  final: { color: colors.discount, fontSize: 14, fontWeight: '600' },
  name: { color: colors.bright, fontSize: 24, fontWeight: '800' },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  offerEnds: { color: colors.muted, fontSize: 13 },
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
