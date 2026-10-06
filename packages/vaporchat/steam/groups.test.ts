import { describe, expect, it } from 'vitest';
import type { ChatGroup } from '../protocol.ts';
import { groupTitle } from './groups.ts';

function group(name: string, memberIds: string[]): ChatGroup {
  return { groupId: '1', name, avatarUrl: null, memberIds, rooms: [] };
}

const names: Record<string, string> = { me: 'Me', a: 'Ann', b: 'Bob' };
const nameOf = (steamid: string) => names[steamid] ?? steamid;

describe('groupTitle', () => {
  it('uses the name the group has', () => {
    expect(groupTitle(group('Raid night', ['me', 'a']), 'me', nameOf)).toBe(
      'Raid night',
    );
  });

  it('names an unnamed group after its other members', () => {
    expect(groupTitle(group('', ['a', 'me', 'b']), 'me', nameOf)).toBe(
      'Ann, Bob',
    );
  });
});
