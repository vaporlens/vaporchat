import { describe, expect, it } from 'vitest';
import { parseBBCode, withMentions } from './bbcode.ts';

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
      'mentions of someone and of everyone, by their SteamID64',
      '[mention=2]@Alice[/mention] and [mention=all]@all[/mention]',
      [
        { kind: 'mention', text: '@Alice', steamid: '76561197960265730' },
        { kind: 'text', text: ' and ' },
        { kind: 'mention', text: '@all', steamid: null },
      ],
    ],
    [
      'mentions in spoilers as their text',
      '[spoiler][mention=2]@Alice[/mention] did it[/spoiler]',
      [
        {
          kind: 'spoiler',
          parts: [
            { kind: 'text', text: '@Alice' },
            { kind: 'text', text: ' did it' },
          ],
        },
      ],
    ],
    [
      'store links Steam previews, as sent from a client',
      'try [steamstore app="620"]https://store.steampowered.com/app/620/[/steamstore]',
      [
        { kind: 'text', text: 'try ' },
        {
          kind: 'storeLink',
          appid: 620,
          url: 'https://store.steampowered.com/app/620/',
        },
      ],
    ],
    [
      'web page and video previews, inside the link or not',
      '[url=https://example.com/a][og url="https://example.com/a" img="https://example.com/a.png" title="A page" desc="About it"]https://example.com/a[/og][/url] [youtube v="abc_1-2"]https://youtu.be/abc_1-2[/youtube]',
      [
        {
          kind: 'webPreview',
          url: 'https://example.com/a',
          title: 'A page',
          description: 'About it',
          imageUrl: 'https://example.com/a.png',
        },
        { kind: 'text', text: ' ' },
        {
          kind: 'youtube',
          videoId: 'abc_1-2',
          url: 'https://www.youtube.com/watch?v=abc_1-2',
        },
      ],
    ],
    [
      'previews without what they need as their link',
      '[og url="https://example.com/b"]https://example.com/b[/og]',
      [
        {
          kind: 'link',
          text: 'https://example.com/b',
          url: 'https://example.com/b',
        },
      ],
    ],
    [
      'previews in spoilers as their link',
      '[spoiler][steamstore app="620"]https://store.steampowered.com/app/620/[/steamstore][/spoiler]',
      [
        {
          kind: 'spoiler',
          parts: [
            {
              kind: 'link',
              text: 'https://store.steampowered.com/app/620/',
              url: 'https://store.steampowered.com/app/620/',
            },
          ],
        },
      ],
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
    [
      'quotes, with what is in them',
      '[quote]see https://example.com[/quote]agreed',
      [
        {
          kind: 'quote',
          parts: [
            { kind: 'text', text: 'see ' },
            {
              kind: 'link',
              text: 'https://example.com',
              url: 'https://example.com',
            },
          ],
        },
        { kind: 'text', text: 'agreed' },
      ],
    ],
    [
      'spoilers as their text',
      'it ends [spoiler]with a [b]twist[/b] \\[x] [emoticon]steamhappy[/emoticon][/spoiler]',
      [
        { kind: 'text', text: 'it ends ' },
        {
          kind: 'spoiler',
          parts: [{ kind: 'text', text: 'with a twist [x] :steamhappy:' }],
        },
      ],
    ],
    [
      'links in spoilers',
      '[spoiler]see https://example.com[/spoiler]',
      [
        {
          kind: 'spoiler',
          parts: [
            { kind: 'text', text: 'see ' },
            {
              kind: 'link',
              text: 'https://example.com',
              url: 'https://example.com',
            },
          ],
        },
      ],
    ],
    [
      'spoiler photos as covered images',
      `[spoiler]${IMAGE}[/spoiler]`,
      [
        {
          kind: 'image',
          url: 'https://example.com/full.png',
          thumbnailUrl: 'https://example.com/full.png?imw=512&&ima=fit',
          width: 1155,
          height: 650,
          spoiler: true,
        },
      ],
    ],
    [
      'code and preformatted text as typed',
      '[code]a[i] = \\[1] \\[/code][/code][pre]  b[/pre]',
      [
        { kind: 'code', text: 'a[i] = [1] [/code]' },
        { kind: 'code', text: '  b' },
      ],
    ],
  ])('reads %s', (_name, bbcode, parts) => {
    expect(parseBBCode(bbcode)).toEqual(parts);
  });
});

describe('withMentions', () => {
  it('marks each picked name up as Steam does, and leaves out ones no longer typed', () => {
    expect(
      withMentions('@Alice and @Al, @all look', [
        { text: '@Al', target: 3 },
        { text: '@Alice', target: 2 },
        { text: '@all', target: 'all' },
        { text: '@Bob', target: 4 },
      ]),
    ).toBe(
      '[mention=2]@Alice[/mention] and [mention=3]@Al[/mention], [mention=all]@all[/mention] look',
    );
  });

  it('leaves a longer name typed without picking it as text', () => {
    expect(withMentions('@Alfred, @Al', [{ text: '@Al', target: 3 }])).toBe(
      '@Alfred, [mention=3]@Al[/mention]',
    );
  });
});
