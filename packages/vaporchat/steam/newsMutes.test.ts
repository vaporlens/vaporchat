import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMutedSources } from './newsMutes.ts';

const SESSION = { sessionid: 's', cookie: 'c', accessToken: 't' };

function page(apps: string, clans: string) {
  return `<script>\n\tg_appidToName = ${apps};\n\tg_clanidToName = ${clans};\n</script>`;
}

describe('getMutedSources', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the muted games and groups with their names', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          page('{"10":"Some Game; Remastered"}', '{"20":"Some Group"}'),
        ),
    );
    expect(await getMutedSources(SESSION)).toEqual([
      { kind: 'app', id: 10, name: 'Some Game; Remastered' },
      { kind: 'group', id: 20, name: 'Some Group' },
    ]);
  });

  it('has none when nothing is muted', async () => {
    vi.stubGlobal('fetch', async () => new Response(page('[]', '[]')));
    expect(await getMutedSources(SESSION)).toEqual([]);
  });
});
