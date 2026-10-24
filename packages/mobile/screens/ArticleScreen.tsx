import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useState } from 'react';
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
import { LinkPreview } from './LinkPreviews';
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

/**
 * Muting the game's or group's news in the user's feed, or unmuting it. Nothing signed out, or
 * until Steam said whether it's muted.
 */
function MuteSource({
  feeds,
  event,
  onError,
}: {
  feeds: SteamFeeds;
  event: SteamEvent;
  onError: (err: Error) => void;
}) {
  // like the News Hub, the game when the post has one
  const source =
    event.appid !== null
      ? { kind: 'app' as const, id: event.appid }
      : { kind: 'group' as const, id: event.clanid };
  const [muted, setMuted] = useState<boolean | null>(null);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    let shown = true;
    feeds
      .getMutedNewsSources()
      .then(
        (sources) =>
          shown &&
          setMuted(
            sources.some(
              ({ kind, id }) => kind === source.kind && id === source.id,
            ),
          ),
      )
      // signed out, or steam didn't say: the post shows without
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [feeds, source.kind, source.id]);
  // posts cached before groups were kept have none
  if (muted === null || !source.id) return null;

  const change = () => {
    setChanging(true);
    feeds
      .setNewsSourceMuted(source, !muted)
      .then(() => setMuted(!muted))
      .catch(onError)
      .finally(() => setChanging(false));
  };
  const kind = event.appid !== null ? 'game' : 'group';
  return (
    <Pressable
      disabled={changing}
      onPress={change}
      accessibilityRole="button"
      accessibilityLabel={
        muted
          ? `Unmute this ${kind}'s news`
          : `Mute this ${kind}'s news in your feed`
      }
      style={({ pressed }) => [
        styles.mute,
        (pressed || changing) && styles.pressed,
      ]}
    >
      <Ionicons
        name={muted ? 'notifications-outline' : 'notifications-off-outline'}
        size={16}
        color={colors.text}
      />
      <Text style={styles.muteText} numberOfLines={1}>
        {muted ? `Unmute ${kind}` : `Mute ${kind}`}
      </Text>
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
      <View style={styles.links}>
        {event.appid !== null && (
          <GameLink feeds={feeds} appid={event.appid} onOpenGame={onOpenGame} />
        )}
        <MuteSource feeds={feeds} event={event} onError={onError} />
      </View>
      <RichText
        blocks={event.body}
        onOpenImage={onOpenImage}
        renderStoreLink={(block) => (
          <LinkPreview feeds={feeds} part={block} onOpenGame={onOpenGame} />
        )}
      />
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
  // the game's link and muting it, side by side
  links: { flexDirection: 'row', gap: 8 },
  game: {
    flex: 1,
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
  // as tall as the game's link beside it
  mute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muteText: { flexShrink: 1, color: colors.text, fontSize: 13 },
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
