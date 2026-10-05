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
        '[p]Look:[img src="{STEAM_APP_IMAGE}/extras/a.gif" width="600" height="300"][/img] nice[/p]' +
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
        url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/440/extras/a.gif',
        width: 600,
        height: 300,
      },
      { kind: 'paragraph', spans: [{ text: 'nice' }] },
      {
        kind: 'image',
        url: 'https://clan.fastly.steamstatic.com/images/12/b.png',
        width: null,
        height: null,
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
      },
      { kind: 'link', url: 'https://store.steampowered.com/app/10' },
      { kind: 'rule' },
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
