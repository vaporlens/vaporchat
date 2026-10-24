import type { ArticleComment, CommentThread, FeedPage } from '../protocol.ts';
import { parseRichText } from './richText.ts';
import { postApi } from './store.ts';
import { COMMUNITY_URL, getText } from './web.ts';

// a news post's comments are a thread of this type, `ForumTopic` in its event
const FORUM_TOPIC_THREAD = 7;
const PAGE_SIZE = 10;

interface ApiComment {
  gidcomment: string;
  steamid: string;
  timestamp?: number;
  text?: string;
}

/**
 * Who wrote a comment or review, from their profile's XML: those only have their steamid. Their
 * mini profiles' JSON fails after a dozen or so at once. Nameless when it can't be loaded, what
 * they wrote still shows.
 */
export async function getAuthor(steamid: string) {
  const xml = await getText(`${COMMUNITY_URL}profiles/${steamid}/?xml=1`).catch(
    () => '',
  );
  // the profile's own come first, its groups' pictures follow
  const field = (tag: string) =>
    xml.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]>`))?.[1];
  return {
    name: field('steamID') ?? '',
    avatarUrl: field('avatarFull') ?? null,
  };
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
