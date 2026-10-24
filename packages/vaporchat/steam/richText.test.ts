import { describe, expect, it } from 'vitest';
import { parseRichText, plainText } from './richText.ts';

describe('parseRichText', () => {
  it('reads paragraphs and headings with styled and linked text', () => {
    expect(
      parseRichText(
        '[h2]Patch notes[/h2][p]Fixed [b]crashes[/b] in [url=https://example.com/map]the [i]map[/i][/url].[/p]',
      ),
    ).toEqual([
      { kind: 'heading', level: 2, spans: [{ text: 'Patch notes' }] },
      {
        kind: 'paragraph',
        spans: [
          { text: 'Fixed ' },
          { text: 'crashes', bold: true },
          { text: ' in ' },
          { text: 'the ', link: 'https://example.com/map' },
          { text: 'map', italic: true, link: 'https://example.com/map' },
          { text: '.' },
        ],
      },
    ]);
  });

  it('splits text without tags into paragraphs at line breaks', () => {
    expect(parseRichText('First line\n\nSecond [u]line[/u]\n')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'First line' }] },
      {
        kind: 'paragraph',
        spans: [{ text: 'Second ' }, { text: 'line', underline: true }],
      },
    ]);
  });

  it('numbers ordered lists, nests lists and keeps markers of items with paragraphs', () => {
    expect(
      parseRichText(
        '[list]\n[*]Maps[list]\n[*]New one[/list]\n[*]Items[/list][olist][*][p]Open it[/p][*]Play[/olist]',
      ),
    ).toEqual([
      { kind: 'listItem', depth: 0, marker: '•', spans: [{ text: 'Maps' }] },
      { kind: 'listItem', depth: 1, marker: '•', spans: [{ text: 'New one' }] },
      { kind: 'listItem', depth: 0, marker: '•', spans: [{ text: 'Items' }] },
      {
        kind: 'listItem',
        depth: 0,
        marker: '1.',
        spans: [{ text: 'Open it' }],
      },
      { kind: 'listItem', depth: 0, marker: '2.', spans: [{ text: 'Play' }] },
    ]);
  });

  it('has pictures, videos and links as blocks of their own, with image placeholders filled', () => {
    expect(
      parseRichText(
        '[p]Look:[img src="{STEAM_APP_IMAGE}/extras/a.avif" width="600" height="300" mp4="{STEAM_APP_IMAGE}/extras/a.mp4" webm="{STEAM_APP_IMAGE}/extras/a.webm" poster="{STEAM_APP_IMAGE}/extras/a.poster.avif"][/img] nice[/p]' +
          '[img]{STEAM_CLAN_IMAGE}/12/b.png[/img]' +
          '[previewyoutube="abc123;full"][/previewyoutube]' +
          '[video mp4="https://example.com/v.mp4" poster="https://example.com/v.png"][/video]' +
          '[dynamiclink href="https://store.steampowered.com/app/10"][/dynamiclink][hr][/hr]',
        440,
      ),
    ).toEqual([
      { kind: 'paragraph', spans: [{ text: 'Look:' }] },
      {
        kind: 'image',
        url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/440/extras/a.avif',
        width: 600,
        height: 300,
        video: {
          mp4: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/440/extras/a.mp4',
          webm: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/440/extras/a.webm',
          posterUrl:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/440/extras/a.poster.avif',
        },
      },
      { kind: 'paragraph', spans: [{ text: 'nice' }] },
      {
        kind: 'image',
        url: 'https://clan.fastly.steamstatic.com/images/12/b.png',
        width: null,
        height: null,
        video: null,
      },
      {
        kind: 'youtube',
        url: 'https://www.youtube.com/watch?v=abc123',
        thumbnailUrl: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
      },
      {
        kind: 'image',
        url: 'https://example.com/v.png',
        width: null,
        height: null,
        video: null,
      },
      {
        kind: 'storeLink',
        appid: 10,
        url: 'https://store.steampowered.com/app/10',
      },
      { kind: 'rule' },
    ]);
  });

  it('shows a linked video as the video, other links as links', () => {
    const linked = (href: string) =>
      parseRichText(`[dynamiclink href="${href}"][/dynamiclink]`)[0];
    const video = (id: string) => ({
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    });

    expect(linked('https://www.youtube.com/watch?v=a-1_b&t=30')).toEqual(
      video('a-1_b'),
    );
    expect(linked('https://youtu.be/c2?si=x')).toEqual(video('c2'));
    expect(linked('https://youtube.com/live/d3')).toEqual(video('d3'));
    expect(linked('https://www.youtube.com/somechannel')).toEqual({
      kind: 'link',
      url: 'https://www.youtube.com/somechannel',
    });
    expect(
      linked('https://store.steampowered.com/app/20/Some_Game/?snr=1'),
    ).toEqual({
      kind: 'storeLink',
      appid: 20,
      url: 'https://store.steampowered.com/app/20/Some_Game/?snr=1',
    });
    expect(linked('https://store.steampowered.com/bundle/30')).toEqual({
      kind: 'link',
      url: 'https://store.steampowered.com/bundle/30',
    });
  });

  it('links urls typed into the text, not the sentence ending them', () => {
    expect(
      parseRichText(
        '[p]See https://example.com/a. Or [url=https://example.com/b]https://example.com/c[/url][/p]',
      ),
    ).toEqual([
      {
        kind: 'paragraph',
        spans: [
          { text: 'See ' },
          { text: 'https://example.com/a', link: 'https://example.com/a' },
          { text: '. Or ' },
          { text: 'https://example.com/c', link: 'https://example.com/b' },
        ],
      },
    ]);
  });

  it('takes an empty video attribute as that format missing', () => {
    expect(
      parseRichText(
        '[img src="https://example.com/a.avif" mp4="" webm="https://example.com/a.webm"][/img]',
      ),
    ).toEqual([
      {
        kind: 'image',
        url: 'https://example.com/a.avif',
        width: null,
        height: null,
        video: {
          mp4: null,
          webm: 'https://example.com/a.webm',
          posterUrl: null,
        },
      },
    ]);
  });

  it('reads a table row as one paragraph, header cells bold', () => {
    expect(
      parseRichText(
        '[table][tr][th][p]Level[/p][/th][th]Class[/th][/tr]\n  [tr][td]1[/td]\n  [td]Cleric[/td][/tr][/table]',
      ),
    ).toEqual([
      {
        kind: 'paragraph',
        spans: [
          { text: 'Level', bold: true },
          { text: ' · ' },
          { text: 'Class', bold: true },
        ],
      },
      {
        kind: 'paragraph',
        spans: [{ text: '1' }, { text: ' · ' }, { text: 'Cleric' }],
      },
    ]);
  });

  it('keeps unknown tags as text, links bare urls and hides spoilers', () => {
    expect(
      parseRichText(
        'Saved in [username]\\Documents, see [url]https://example.com[/url] [spoiler]ending[/spoiler]',
      ),
    ).toEqual([
      {
        kind: 'paragraph',
        spans: [
          { text: 'Saved in [username]\\Documents, see ' },
          { text: 'https://example.com', link: 'https://example.com' },
          { text: ' ' },
          { text: 'ending', spoiler: true },
        ],
      },
    ]);
  });
});

describe('plainText', () => {
  it('joins the text of blocks, without pictures and videos', () => {
    expect(
      plainText(
        parseRichText(
          '[h1]New map[/h1][img]{STEAM_CLAN_IMAGE}/1/a.png[/img]\n[previewyoutube=abc;full][/previewyoutube]' +
            '[p]Go [url=https://example.com]play[/url] it now[/p]',
        ),
      ),
    ).toBe('New map Go play it now');
  });
});
