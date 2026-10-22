import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { GameReview } from 'vaporchat/protocol';
import { Avatar } from '../components/Avatar';
import { RichText } from '../components/RichText';
import { fullDate } from '../format';
import { colors } from '../theme';
import { PagedList } from './PagedList';
import { ReviewHistogram } from './ReviewHistogram';

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

/** A game's reviews over time, then the reviews, most helpful first, the next ones loading once scrolled to the end. */
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
  return (
    <>
      <ReviewHistogram feeds={feeds} appid={appid} />
      <PagedList
        load={load}
        keyOf={keyOf}
        cacheKey={`reviews-${appid}`}
        empty="No reviews yet"
        renderItem={(review) => (
          <Review review={review} onOpenImage={onOpenImage} />
        )}
        onError={onError}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
