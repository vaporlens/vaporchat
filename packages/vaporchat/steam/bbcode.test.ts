import { describe, expect, it } from 'vitest';
import { parseBBCode } from './bbcode.ts';

const ECONOMY = 'https://community.fastly.steamstatic.com/economy';
// the shape Steam's clients send images in: bare and quoted attributes, the link repeated inside
const IMAGE =
  '[img src=https://example.com/full.png thumbnail_src=https://example.com/full.png?imw=512&&ima=fit srcset="https://example.com/full.png?imw=1024 1024w" width=1155 height=650][url=https://example.com/full.png]https://example.com/full.png[/url][/img]';

describe('parseBBCode', () => {
  it.each([
    ['plain text', 'hello', [{ kind: 'text', text: 'hello' }]],
    [
      'escaped brackets',
      'see \\[b]this\\[/b]',
      [{ kind: 'text', text: 'see [b]this[/b]' }],
    ],
    [
      'mentions as their text',
      '[mention=2]@Alice[/mention] hi',
      [{ kind: 'text', text: '@Alice hi' }],
    ],
    [
      'links, with their text or address',
      'see [url=https://example.com]a [b]site[/b][/url] or [url]https://example.org[/url]',
      [
        { kind: 'text', text: 'see ' },
        { kind: 'link', text: 'a site', url: 'https://example.com' },
        { kind: 'text', text: ' or ' },
        {
          kind: 'link',
          text: 'https://example.org',
          url: 'https://example.org',
        },
      ],
    ],
    [
      'links typed as text, without the punctuation after them',
      'look: https://example.com/a?b=1. ok',
      [
        { kind: 'text', text: 'look: ' },
        {
          kind: 'link',
          text: 'https://example.com/a?b=1',
          url: 'https://example.com/a?b=1',
        },
        { kind: 'text', text: '. ok' },
      ],
    ],
    [
      'links to anything but web pages as text',
      '[url=javascript:alert(1)]click[/url]',
      [{ kind: 'text', text: 'click' }],
    ],
    [
      'emoticons inside text',
      'gg [emoticon]steamhappy[/emoticon]!',
      [
        { kind: 'text', text: 'gg ' },
        {
          kind: 'emoticon',
          name: 'steamhappy',
          url: `${ECONOMY}/emoticonlarge/steamhappy`,
        },
        { kind: 'text', text: '!' },
      ],
    ],
    [
      'stickers, with spaces in their names',
      '[sticker type="Big Cat" limit="0"][/sticker]',
      [
        {
          kind: 'sticker',
          name: 'Big Cat',
          url: `${ECONOMY}/sticker/Big%20Cat`,
        },
      ],
    ],
    [
      'images',
      IMAGE,
      [
        {
          kind: 'image',
          url: 'https://example.com/full.png',
          thumbnailUrl: 'https://example.com/full.png?imw=512&&ima=fit',
          width: 1155,
          height: 650,
        },
      ],
    ],
  ])('reads %s', (_name, bbcode, parts) => {
    expect(parseBBCode(bbcode)).toEqual(parts);
  });
});
