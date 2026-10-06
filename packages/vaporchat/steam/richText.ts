import type { RichBlock, RichSpan } from '../protocol.ts';
import { attributes, size } from './bbcode.ts';
import { ASSETS_URL, CLAN_IMAGES_URL } from './web.ts';

// `[b]`, `[/b]`, `[url=https://…]`, `[img src="…" width="600"]`, `[*]`
const TAG = /\[(\/?)([a-zA-Z0-9*]+)((?:=|\s)[^\]]*)?\]/g;

type Style = 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler';
const STYLES: Record<string, Style> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
  strike: 'strike',
  spoiler: 'spoiler',
};
// tags whose content is their value, not text
const CONTENT_TAGS = new Set([
  'img',
  'previewyoutube',
  'video',
  'dynamiclink',
  'code',
]);
// containers that only matter to the website's layout
const IGNORED = new Set(['carousel', 'table']);
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'quote']);
const KNOWN = new Set([
  ...Object.keys(STYLES),
  ...CONTENT_TAGS,
  ...IGNORED,
  ...BLOCKS,
  'url',
  'list',
  'olist',
  '*',
  'hr',
  'tr',
  'td',
  'th',
]);

type TextBlock = Extract<RichBlock, { spans: RichSpan[] }>;

/** `[url=x]` and `[previewyoutube="x;full"]` have a value, others only attributes. */
function parseAttributes(rest: string) {
  if (!rest.startsWith('=')) return attributes(rest);
  const value = rest.slice(1).match(/^"([^"]*)"|^[^\s]*/)!;
  return {
    ...attributes(rest.slice(1 + value[0].length)),
    value: value[1] ?? value[0],
  };
}

/** An animated picture also comes as a video, lighter to play. */
function animation(attrs: Record<string, string>) {
  const url = attrs.mp4 ?? attrs.webm;
  return url ? { url, posterUrl: attrs.poster ?? null } : null;
}

function youtube(value: string): RichBlock {
  const id = value.split(';')[0];
  return {
    kind: 'youtube',
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  };
}

/** Drops the whitespace around a block's text, null when there is no text left. */
function trimmed<T extends TextBlock>(block: T): T | null {
  const spans = block.spans.filter((span) => span.text !== '');
  if (spans.length === 0) return null;
  spans[0] = { ...spans[0]!, text: spans[0]!.text.trimStart() };
  const last = spans.length - 1;
  spans[last] = { ...spans[last]!, text: spans[last]!.text.trimEnd() };
  const kept = spans.filter((span) => span.text !== '');
  return kept.length > 0 ? { ...block, spans: kept } : null;
}

/**
 * Turns the BBCode of a store page or news post into blocks to render. `appid` is the
 * game whose pictures `{STEAM_APP_IMAGE}` refers to. Unknown tags stay as text.
 */
export function parseRichText(
  bbcode: string,
  appid: number | null = null,
): RichBlock[] {
  const source = bbcode
    .replaceAll('{STEAM_APP_IMAGE}/', `${ASSETS_URL}steam/apps/${appid ?? 0}/`)
    .replace(/\{STEAM_CLAN(_LOC)?_IMAGE\}\//g, CLAN_IMAGES_URL);
  const blocks: RichBlock[] = [];
  const styles: Record<Style, number> = {
    bold: 0,
    italic: 0,
    underline: 0,
    strike: 0,
    spoiler: 0,
  };
  const links: string[] = [];
  const lists: { ordered: boolean; count: number }[] = [];
  let current: TextBlock | null = null;
  // cells of the table row being read, a row is one paragraph
  let cells: number | null = null;

  const flush = () => {
    const block = current && trimmed(current);
    if (block) blocks.push(block);
    current = null;
  };
  const start = (block: TextBlock) => {
    flush();
    current = block;
  };
  const append = (text: string, link = links.at(-1)) => {
    if (text === '') return;
    // whitespace between blocks isn't a paragraph
    if (!current && text.trim() === '') return;
    current ??= { kind: 'paragraph', spans: [] };
    const span: RichSpan = { text };
    for (const style of Object.keys(styles) as Style[]) {
      if (styles[style] > 0) span[style] = true;
    }
    if (link) span.link = link;
    current.spans.push(span);
  };
  const addText = (text: string) => {
    if (cells !== null) {
      // a table row is one line, the layout whitespace between its cells is dropped
      if (text.trim() !== '') append(text.replace(/\s*\n\s*/g, ' '));
      return;
    }
    // a line break ends the paragraph
    text.split('\n').forEach((line, index) => {
      if (index > 0) flush();
      append(line);
    });
  };

  let position = 0;
  for (const match of source.matchAll(TAG)) {
    if (match.index < position) continue;
    const [whole, closing, rawName, rest = ''] = match;
    const name = rawName!.toLowerCase();
    if (!KNOWN.has(name)) continue;
    addText(source.slice(position, match.index));
    position = match.index + whole.length;
    const attrs = parseAttributes(rest);

    if (!closing && CONTENT_TAGS.has(name)) {
      const end = source.indexOf(`[/${name}]`, position);
      const content = end === -1 ? '' : source.slice(position, end);
      if (end !== -1) position = end + name.length + 3;
      if (name === 'code') {
        flush();
        blocks.push({ kind: 'code', text: content.replace(/^\n|\n$/g, '') });
        continue;
      }
      let block: RichBlock | null = null;
      if (name === 'img') {
        const url = (attrs.src ?? content).trim();
        if (url) {
          block = {
            kind: 'image',
            url,
            width: size(attrs.width),
            height: size(attrs.height),
            video: animation(attrs),
          };
        }
      } else if (name === 'video' && attrs.poster) {
        block = {
          kind: 'image',
          url: attrs.poster,
          width: null,
          height: null,
          video: null,
        };
      } else if (name === 'previewyoutube' && attrs.value) {
        block = youtube(attrs.value);
      } else if (name === 'dynamiclink' && attrs.href) {
        block = { kind: 'link', url: attrs.href };
      }
      if (block) {
        flush();
        blocks.push(block);
      }
      continue;
    }

    const toggle = (style: Style) => {
      styles[style] = Math.max(0, styles[style] + (closing ? -1 : 1));
    };
    const style = STYLES[name];
    if (style) {
      toggle(style);
    } else if (name === 'url') {
      if (closing) links.pop();
      else if (attrs.value) links.push(attrs.value);
      else {
        // `[url]https://…[/url]` links to its own text
        const end = source.indexOf('[/url]', position);
        const text = source.slice(position, end === -1 ? undefined : end);
        append(text, text.trim());
        position = end === -1 ? source.length : end + 6;
      }
    } else if (BLOCKS.has(name)) {
      // assigned in the closures above, which narrowing doesn't see
      const item = current as TextBlock | null;
      // a table row stays one paragraph, a list item keeps its marker for the paragraph in it
      if (cells !== null) continue;
      if (!closing && item?.kind === 'listItem' && !trimmed(item)) continue;
      if (closing) flush();
      else if (name === 'p') start({ kind: 'paragraph', spans: [] });
      else if (name === 'quote') start({ kind: 'quote', spans: [] });
      else {
        const level = Number(name[1]) as 1 | 2 | 3;
        start({ kind: 'heading', level, spans: [] });
      }
    } else if (name === 'list' || name === 'olist') {
      flush();
      if (closing) lists.pop();
      else lists.push({ ordered: name === 'olist', count: 0 });
    } else if (name === '*') {
      const list = lists.at(-1);
      const marker = list?.ordered ? `${++list.count}.` : '•';
      start({
        kind: 'listItem',
        depth: Math.max(0, lists.length - 1),
        marker,
        spans: [],
      });
    } else if (name === 'hr') {
      if (!closing) {
        flush();
        blocks.push({ kind: 'rule' });
      }
    } else if (name === 'tr') {
      if (closing) {
        flush();
        cells = null;
      } else {
        start({ kind: 'paragraph', spans: [] });
        cells = 0;
      }
    } else if (name === 'td' || name === 'th') {
      if (!closing && cells !== null) {
        if (cells > 0) append(' · ');
        cells++;
      }
      if (name === 'th') toggle('bold');
    }
  }
  addText(source.slice(position));
  flush();
  return blocks;
}

/** The text of rich text blocks, without formatting, pictures or videos. */
export function plainText(blocks: RichBlock[]) {
  return blocks
    .flatMap((block) =>
      'spans' in block ? block.spans.map((span) => span.text) : [],
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
