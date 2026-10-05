import type { ChatPart } from '../protocol.ts';

// the CDN Steam's own chat loads emoticons and stickers from
const ECONOMY_URL = 'https://community.fastly.steamstatic.com/economy';

// an escaped bracket, an emoticon, a sticker, an image, or any other tag
const TOKEN =
  /\\\[|\[emoticon\]([^[\]]*)\[\/emoticon\]|\[sticker([^\]]*)\][\s\S]*?\[\/sticker\]|\[img([^\]]*)\][\s\S]*?\[\/img\]|\[\/?[a-z]+[^\]]*\]/g;
// `name=value` or `name="value with spaces"`
const ATTRIBUTE = /(\w+)=(?:"([^"]*)"|([^\s"]*))/g;

// the large one, the small one is 18px and blurry on phones
export function emoticonUrl(name: string) {
  return `${ECONOMY_URL}/emoticonlarge/${encodeURIComponent(name)}`;
}

export function stickerUrl(name: string) {
  return `${ECONOMY_URL}/sticker/${encodeURIComponent(name)}`;
}

function attributes(tag: string) {
  const found: Record<string, string> = {};
  for (const [, name, quoted, bare] of tag.matchAll(ATTRIBUTE)) {
    found[name] = quoted ?? bare;
  }
  return found;
}

function size(value: string | undefined) {
  const n = Number(value);
  return n > 0 ? n : null;
}

/**
 * Steam's chat BBCode as parts to render: text, emoticons, stickers and images. Other tags
 * (links, quotes, mentions) are dropped, keeping the text they wrap.
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
    const [token, emoticon, sticker, image] = match;
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
  return parts;
}
