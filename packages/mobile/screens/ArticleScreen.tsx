import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type {
  ArticleComment,
  CommentThread,
  SteamEvent,
  StoreItem,
} from 'vaporchat/protocol';
import { useCached } from '../cache';
import { Avatar } from '../components/Avatar';
import { DetailPage } from '../components/DetailPage';
import { RichText } from '../components/RichText';
import { SectionTitle } from '../components/SectionTitle';
import { fullDate } from '../format';
import { colors } from '../theme';
import { PagedList } from './PagedList';

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

function commentKey(comment: ArticleComment) {
  return comment.id;
}

/** Memoized, a new page renders only its own comments. */
const Comment = memo(function Comment({
  comment,
  onOpenImage,
}: {
  comment: ArticleComment;
  onOpenImage: (url: string) => void;
}) {
  // nameless when their profile didn't load
  const author = comment.author || 'Steam user';
  return (
    <View style={styles.comment}>
      <View style={styles.byline}>
        <Avatar url={comment.avatarUrl} name={author} size={28} />
        <Text style={styles.author} numberOfLines={1}>
          {author}
        </Text>
        <Text style={styles.muted}>{fullDate(comment.postedAt)}</Text>
      </View>
      <RichText blocks={comment.body} onOpenImage={onOpenImage} />
    </View>
  );
});

/** How many rated a post up and its comments, newest first. Read only, both happen in Steam. */
function Comments({
  feeds,
  event,
  thread,
  onOpenImage,
  onError,
}: {
  feeds: SteamFeeds;
  event: SteamEvent;
  thread: CommentThread;
  onOpenImage: (url: string) => void;
  onError: (err: Error) => void;
}) {
  const load = useCallback(
    (start: number | null) => feeds.getComments(thread, start),
    [feeds, thread],
  );
  return (
    <>
      <View
        style={styles.counts}
        accessible
        accessibilityLabel={`${event.votesUp} rated up, ${event.commentCount} comments`}
      >
        <Ionicons name="thumbs-up-outline" size={16} color={colors.muted} />
        <Text style={styles.muted}>{event.votesUp.toLocaleString()}</Text>
        <Ionicons
          name="chatbubble-outline"
          size={16}
          color={colors.muted}
          style={styles.countGap}
        />
        <Text style={styles.muted}>{event.commentCount.toLocaleString()}</Text>
      </View>
      <SectionTitle title="Comments" />
      <PagedList
        load={load}
        keyOf={commentKey}
        cacheKey={`comments-${event.id}`}
        empty="No comments yet"
        renderItem={(comment) => (
          <Comment comment={comment} onOpenImage={onOpenImage} />
        )}
        onError={onError}
      />
    </>
  );
}

/** A whole news post: its picture, title and text, the game it's about, and its comments. */
export function ArticleScreen({
  feeds,
  event,
  onBack,
  onOpenGame,
  onOpenImage,
  onError,
}: {
  feeds: SteamFeeds;
  event: SteamEvent;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
  onOpenImage: (url: string) => void;
  /** a later page of comments failing, scrolling to the end again retries */
  onError: (err: Error) => void;
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
      {/* posts cached before comments were loaded have no thread */}
      {event.commentThread && (
        <Comments
          feeds={feeds}
          event={event}
          thread={event.commentThread}
          onOpenImage={onOpenImage}
          onError={onError}
        />
      )}
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
  muted: { color: colors.muted, fontSize: 13 },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countGap: { marginLeft: 10 },
  comment: {
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { flex: 1, color: colors.bright, fontSize: 14, fontWeight: '600' },
});
