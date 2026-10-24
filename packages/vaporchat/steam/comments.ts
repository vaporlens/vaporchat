import type { ArticleComment, CommentThread, FeedPage } from '../protocol.ts';
import { accountIdFromSteamId } from './friends.ts';
import { parseRichText } from './richText.ts';
import { postApi } from './store.ts';
import { COMMUNITY_URL, getJson } from './web.ts';

// a news post's comments are a thread of this type, `ForumTopic` in its event
const FORUM_TOPIC_THREAD = 7;
const PAGE_SIZE = 10;

interface ApiComment {
  gidcomment: string;
  steamid: string;
  timestamp?: number;
  text?: string;
}

interface MiniProfile {
  persona_name?: string;
  avatar_url?: string | null;
}

/**
 * Who wrote a comment or review, from their mini profile: those only have their steamid.
 * Nameless when it can't be loaded, what they wrote still shows.
 */
export async function getAuthor(steamid: string) {
  const accountId = accountIdFromSteamId(steamid);
  const { persona_name = '', avatar_url = null } = await getJson<MiniProfile>(
    `${COMMUNITY_URL}miniprofile/${accountId}/json`,
  ).catch((): MiniProfile => ({}));
  return { name: persona_name, avatarUrl: avatar_url };
}

/** A page of a news post's comments, newest first. `start` is the `next` of the previous page. */
export async function getComments(
  { clanSteamid, gidfeature, gidfeature2 }: CommentThread,
  start: number | null,
): Promise<FeedPage<ArticleComment>> {
  const from = start ?? 0;
  const { comments = [], total_count = 0 } = await postApi<{
    comments?: ApiComment[];
    total_count?: number;
  }>('ICommunityService/GetCommentThread', {
    steamid: clanSteamid,
    comment_thread_type: FORUM_TOPIC_THREAD,
    gidfeature,
    gidfeature2,
    start: from,
    count: PAGE_SIZE,
  });
  const steamids = [...new Set(comments.map(({ steamid }) => steamid))];
  const authors = new Map(
    await Promise.all(
      steamids.map(async (id) => [id, await getAuthor(id)] as const),
    ),
  );
  const next = from + comments.length;
  return {
    items: comments.map((comment) => ({
      id: comment.gidcomment,
      author: authors.get(comment.steamid)?.name ?? '',
      avatarUrl: authors.get(comment.steamid)?.avatarUrl ?? null,
      postedAt: (comment.timestamp ?? 0) * 1000,
      body: parseRichText(comment.text ?? ''),
    })),
    next: comments.length > 0 && next < total_count ? next : null,
  };
}
