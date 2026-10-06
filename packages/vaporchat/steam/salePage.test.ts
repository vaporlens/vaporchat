import { describe, expect, it } from 'vitest';
import { toSaleSections } from './salePage.ts';

describe('toSaleSections', () => {
  it('keeps texts and game lists in order, with their english labels', () => {
    const jsondata = JSON.stringify({
      sale_sections: [
        {
          section_type: 'text_section',
          localized_label: ['About', null],
          text_section_contents: ['[b]Spooky[/b] games'],
        },
        {
          section_type: 'trailercarousel',
          capsules: [{ id: 1, type: 'game' }],
        },
        {
          section_type: 'items',
          localized_label: [null],
          default_label: 'Featured',
          capsules: [
            { id: 10, type: 'game' },
            { id: 20, type: 'bundle' },
            { id: 30, type: 'sub' },
            { id: 40, type: 'dlc' },
          ],
        },
        // filled by a store query on the website, nothing to list here
        {
          section_type: 'items',
          default_label: '#Sale_default_label',
          capsules: [],
        },
      ],
    });
    expect(toSaleSections(jsondata, 0)).toEqual([
      {
        title: 'About',
        body: [
          {
            kind: 'paragraph',
            spans: [{ text: 'Spooky', bold: true }, { text: ' games' }],
          },
        ],
        refs: [],
      },
      {
        title: 'Featured',
        body: [],
        refs: [
          { appid: 10 },
          { bundleid: 20 },
          { packageid: 30 },
          { appid: 40 },
        ],
      },
    ]);
  });

  it("shows texts and labels in the user's language only, english where there is none", () => {
    const jsondata = JSON.stringify({
      sale_sections: [
        {
          section_type: 'text_section',
          localized_label: ['About', 'Über'],
          text_section_contents: ['In english', 'Auf Deutsch', 'En français'],
        },
        {
          section_type: 'text_section',
          localized_label: ['Rules', null],
          text_section_contents: ['English only'],
        },
      ],
    });
    expect(
      toSaleSections(jsondata, 1).map(({ title, body }) => ({ title, body })),
    ).toEqual([
      {
        title: 'Über',
        body: [{ kind: 'paragraph', spans: [{ text: 'Auf Deutsch' }] }],
      },
      {
        title: 'Rules',
        body: [{ kind: 'paragraph', spans: [{ text: 'English only' }] }],
      },
    ]);
  });

  it('has no sections without sale JSON', () => {
    expect(toSaleSections('{', 0)).toEqual([]);
    expect(toSaleSections('{}', 0)).toEqual([]);
  });
});
