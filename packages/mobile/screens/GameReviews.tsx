import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { GameReview } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { useOnScreen } from '../components/onScreen';
import { RichText } from '../components/RichText';
import { fullDate } from '../format';
import { colors } from '../theme';
import { usePaging } from './usePaging';

function keyOf(review: GameReview) {
  return review.id;
}

/** Memoized, a new page renders only its own reviews. */
const Review = memo(function Review({
  review,
  onOpenImage,
}: {
  review: GameReview;
  onOpenImage: (url: string) => void;
}) {
  const color = review.recommended ? colors.positive : colors.negative;
  return (
    <View style={styles.review}>
      <View style={styles.author}>
        <Avatar url={review.avatarUrl} name={review.author} size={36} />
        <View style={styles.byline}>
          <View style={styles.line}>
            <Text style={styles.name} numberOfLines={1}>
              {review.author}
            </Text>
            <Text style={styles.muted}>{fullDate(review.createdAt)}</Text>
          </View>
          <View style={styles.line}>
            <Ionicons
              name={review.recommended ? 'thumbs-up' : 'thumbs-down'}
              size={14}
              color={color}
            />
            <Text style={[styles.verdict, { color }]}>
              {review.recommended ? 'Recommended' : 'Not recommended'}
            </Text>
            <Text style={styles.muted}>
              {`· ${review.hoursPlayed.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs played`}
            </Text>
          </View>
        </View>
      </View>
      <RichText blocks={review.body} onOpenImage={onOpenImage} />
      {review.helpful > 0 && (
        <Text style={styles.muted}>
          {`${review.helpful.toLocaleString()} found this helpful`}
        </Text>
      )}
    </View>
  );
});

/** A game's reviews, most helpful first, the next ones loading once scrolled to the end. */
export function GameReviews({
  feeds,
  appid,
  onOpenImage,
  onError,
}: {
  feeds: SteamFeeds;
  appid: number;
  onOpenImage: (url: string) => void;
  /** a later page failing, scrolling to the end again retries */
  onError: (err: Error) => void;
}) {
  const load = useCallback(
    (cursor: string | null) => feeds.getGameReviews(appid, cursor),
    [feeds, appid],
  );
  const list = usePaging(load, keyOf, `reviews-${appid}`, onError);
  const end = useRef<View>(null);
  const onEndLayout = useOnScreen(end, (visible, settled) => {
    // once scrolling pauses, a failing page isn't asked for on every scroll event
    if (visible && settled) list.loadMore();
  });

  if (!list.items) {
    return list.error ? (
      <Text style={styles.muted}>{list.error}</Text>
    ) : (
      <ActivityIndicator color={colors.muted} style={styles.loading} />
    );
  }
  if (list.items.length === 0) {
    return <Text style={styles.muted}>No reviews yet</Text>;
  }
  return (
    <>
      {list.items.map((review) => (
        <Review key={review.id} review={review} onOpenImage={onOpenImage} />
      ))}
      {list.next !== null && (
        <View ref={end} onLayout={onEndLayout}>
          <ActivityIndicator color={colors.muted} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  muted: { color: colors.muted, fontSize: 13 },
  review: {
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  byline: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: colors.bright, fontSize: 14, fontWeight: '600' },
  verdict: { fontSize: 13, fontWeight: '700' },
});
