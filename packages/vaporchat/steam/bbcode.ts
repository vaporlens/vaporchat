import type { ChatPart } from '../protocol.ts';
import { steamIdFromAccountId } from './friends.ts';
import { STORE_URL } from './web.ts';

// the CDN Steam's own chat loads emoticons and stickers from
const ECONOMY_URL = 'https://community.fastly.steamstatic.com/economy';

// an escaped bracket, an emoticon, a sticker, an image, a link, a quote, a spoiler, code (`/code`
// and `/pre`), a mention, a link Steam previews, or any other tag. Escaped brackets inside quotes, spoilers and code
// don't end them
const TOKEN =
  /\\\[|\[emoticon\]([^[\]]*)\[\/emoticon\]|\[sticker([^\]]*)\][\s\S]*?\[\/sticker\]|\[img([^\]]*)\][\s\S]*?\[\/img\]|\[url(=[^\]]*)?\]([\s\S]*?)\[\/url\]|\[quote[^\]]*\]((?:\\\[|[\s\S])*?)\[\/quote\]|\[spoiler\]((?:\\\[|[\s\S])*?)\[\/spoiler\]|\[(code|pre)\]((?:\\\[|[\s\S])*?)\[\/\8\]|\[mention=([^\]]*)\]([\s\S]*?)\[\/mention\]|\[(steamstore|og|youtube)([^\]]*)\]([\s\S]*?)\[\/\12\]|\[\/?[a-z]+[^\]]*\]/g;
// a preview Steam put in a link it was sent
const PREVIEW = /\[(steamstore|og|youtube)\b/;
// an emoticon, kept as `:name:` text inside a spoiler
const EMOTICON = /\[emoticon\]([^[\]]*)\[\/emoticon\]/g;
// an escaped bracket or a tag, inside a link's text
const ESCAPE_OR_TAG = /\\\[|\[\/?[a-z]+[^\]]*\]/g;
// links typed without BBCode, not counting the punctuation that ends a sentence
const BARE_URL = /https?:\/\/[^\s[\]<>]*[^\s[\]<>.,;:!?'")]/g;
// `name=value` or `name="value with spaces"`
const ATTRIBUTE = /(\w+)=(?:"([^"]*)"|([^\s"]*))/g;

// the large one, the small one is 18px and blurry on phones
export function emoticonUrl(name: string) {
  return `${ECONOMY_URL}/emoticonlarge/${encodeURIComponent(name)}`;
}

export function stickerUrl(name: string) {
  return `${ECONOMY_URL}/sticker/${encodeURIComponent(name)}`;
}

export function attributes(tag: string) {
  const found: Record<string, string> = {};
  for (const [, name, quoted, bare] of tag.matchAll(ATTRIBUTE)) {
    found[name] = quoted ?? bare;
  }
  return found;
}

export function size(value: string | undefined) {
  const n = Number(value);
  return n > 0 ? n : null;
}

/** Someone picked to mention as `text` (`@name`): their account id, or `all` or `here`. */
export interface MentionPick {
  text: string;
  target: number | 'all' | 'here';
}

/**
 * Typed text with the mentions picked for it as Steam's clients send them, so Steam tells who
 * was mentioned. A mention deleted from the text is left out.
 */
export function withMentions(text: string, picks: MentionPick[]) {
  if (picks.length === 0) return text;
  const targets = new Map(picks.map((pick) => [pick.text, pick.target]));
  // longest first, `@Al` doesn't take the start of `@Alice`
  const names = [...targets.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // a whole name, `@Alfred` typed without picking isn't `@Al` picked
  return text.replace(
    new RegExp(`(?:${names.join('|')})(?![\\p{L}\\p{N}_])`, 'gu'),
    (name) => `[mention=${targets.get(name)}]${name}[/mention]`,
  );
}

/**
 * The preview Steam's server puts in place of a link it was sent: a store page, a web page by its
 * Open Graph tags, a YouTube video. `link` is what was sent, null when the tag lacks what it needs.
 */
function preview(tag: string, attrs: string, link: string): ChatPart | null {
  const found = attributes(attrs);
  if (tag === 'steamstore') {
    const appid = Number(found.app);
    return appid > 0
      ? { kind: 'storeLink', appid, url: link || `${STORE_URL}app/${appid}` }
      : null;
  }
  if (tag === 'youtube') {
    return found.v
      ? {
          kind: 'youtube',
          videoId: found.v,
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(found.v)}`,
        }
      : null;
  }
  const url = found.url ?? link;
  return /^https?:\/\//i.test(url) && found.title
    ? {
        kind: 'webPreview',
        url,
        title: found.title,
        description: found.desc ?? '',
        imageUrl: found.img || null,
      }
    : null;
}

/** Text inside a tag, without the tags in it. */
function plain(text: string) {
  return text.replace(ESCAPE_OR_TAG, (found) => (found === '\\[' ? '[' : ''));
}

/** Text with the links typed into it as link parts. */
function withLinks(text: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let index = 0;
  for (const match of text.matchAll(BARE_URL)) {
    if (match.index > index)
      parts.push({ kind: 'text', text: text.slice(index, match.index) });
    parts.push({ kind: 'link', text: match[0], url: match[0] });
    index = match.index + match[0].length;
  }
  if (index < text.length)
    parts.push({ kind: 'text', text: text.slice(index) });
  return parts;
}

/**
 * Steam's chat BBCode as parts to render: text, links, emoticons, stickers, images, spoilers,
 * code, quotes and mentions. Other tags are dropped, keeping the text they wrap. A quote ends at
 * its first `[/quote]`, so one quoting another isn't nested.
 */
export function parseBBCode(bbcode: string): ChatPart[] {
  const parts: ChatPart[] = [];
  const addText = (text: string) => {
    if (text === '') return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
  };
  let index = 0;
  for (const match of bbcode.matchAll(TOKEN)) {
    addText(bbcode.slice(index, match.index));
    index = match.index + match[0].length;
    const [
      token,
      emoticon,
      sticker,
      image,
      linkTarget,
      linkText,
      quote,
      spoiler,
      ,
      code,
      mentioned,
      mentionText,
      previewTag,
      previewAttrs,
      previewText,
    ] = match;
    if (token === '\\[') {
      addText('[');
    } else if (emoticon !== undefined) {
      parts.push({
        kind: 'emoticon',
        name: emoticon,
        url: emoticonUrl(emoticon),
      });
    } else if (sticker !== undefined) {
      const { type } = attributes(sticker);
      if (type) {
        parts.push({ kind: 'sticker', name: type, url: stickerUrl(type) });
      }
    } else if (linkText !== undefined && PREVIEW.test(linkText)) {
      // the link around its preview
      parts.push(...parseBBCode(linkText));
    } else if (linkText !== undefined) {
      const text = plain(linkText);
      // `[url=…]text[/url]`, or `[url]…[/url]` with the address as its text
      const url = linkTarget?.slice(1).replace(/^"|"$/g, '') || text;
      // only web pages open, anything else stays text
      if (/^https?:\/\//i.test(url))
        parts.push({ kind: 'link', text: text || url, url });
      else addText(text);
    } else if (quote !== undefined) {
      parts.push({ kind: 'quote', parts: parseBBCode(quote) });
    } else if (spoiler !== undefined) {
      const inner = parseBBCode(spoiler.replace(EMOTICON, ':$1:'));
      // a spoiler photo is an image in a spoiler
      const images = inner.filter((p) => p.kind === 'image');
      if (images.length > 0)
        parts.push(...images.map((image) => ({ ...image, spoiler: true })));
      else
        parts.push({
          kind: 'spoiler',
          parts: inner.flatMap((p) =>
            p.kind === 'text' || p.kind === 'link'
              ? [p]
              : p.kind === 'mention'
                ? [{ kind: 'text' as const, text: p.text }]
                : // a preview is its link there
                  p.kind === 'storeLink' ||
                    p.kind === 'webPreview' ||
                    p.kind === 'youtube'
                  ? [{ kind: 'link' as const, text: p.url, url: p.url }]
                  : [],
          ),
        });
    } else if (mentionText !== undefined) {
      // `[mention=<account id>]`, or `all` and `here` for everyone
      const accountId = Number(mentioned);
      parts.push({
        kind: 'mention',
        text: plain(mentionText),
        steamid: accountId > 0 ? steamIdFromAccountId(accountId) : null,
      });
    } else if (previewText !== undefined) {
      const link = plain(previewText).trim();
      const found = preview(previewTag, previewAttrs, link);
      if (found) parts.push(found);
      else addText(link);
    } else if (code !== undefined) {
      // as typed, tags in it are text
      parts.push({ kind: 'code', text: code.replace(/\\\[/g, '[') });
    } else if (image !== undefined) {
      const { src, thumbnail_src, width, height } = attributes(image);
      if (src) {
        parts.push({
          kind: 'image',
          url: src,
          thumbnailUrl: thumbnail_src ?? src,
          width: size(width),
          height: size(height),
        });
      }
    }
  }
  addText(bbcode.slice(index));
  return parts.flatMap((part) =>
    part.kind === 'text' ? withLinks(part.text) : [part],
  );
}
