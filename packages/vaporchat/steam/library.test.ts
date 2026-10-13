import { describe, expect, it } from 'vitest';
import { libraryItems } from './library.ts';

describe('libraryItems', () => {
  it('has recently played games first, then never played ones by name', () => {
    const items = libraryItems([
      { appid: 1, name: 'Zeta', rtime_last_played: 0 },
      { appid: 2, name: 'Old', rtime_last_played: 100 },
      { appid: 3, name: 'Alpha' },
      { appid: 4, name: 'Recent', rtime_last_played: 200 },
    ]);
    expect(items.map((item) => item.name)).toEqual([
      'Recent',
      'Old',
      'Alpha',
      'Zeta',
    ]);
  });
});
