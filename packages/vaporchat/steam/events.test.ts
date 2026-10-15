import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ApiEvent, getGameNews, toSteamEvent } from './events.ts';

// clan account id 46255707
const CLAN_STEAMID = '103582791475777115';

function event(json: object, overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    gid: '7',
    clan_steamid: CLAN_STEAMID,
    appid: 0,
    event_name: 'Big Sale',
    rtime32_start_time: 100,
    rtime32_end_time: 200,
    jsondata: JSON.stringify(json),
    ...overrides,
  };
}

describe('toSteamEvent', () => {
  it('links approved sale pages under /sale/, others under their curator', () => {
    expect(
      toSteamEvent(
        event({
          sale_vanity_id: 'BigSale',
          sale_vanity_id_valve_approved_for_sale_subpath: true,
        }),
        0,
      ).url,
    ).toBe('https://store.steampowered.com/sale/BigSale');
    expect(toSteamEvent(event({ sale_vanity_id: 'BigSale' }), 0).url).toBe(
      'https://store.steampowered.com/curator/46255707/sale/BigSale',
    );
  });

  it("links posts without a sale page to their game's or group's news", () => {
    expect(toSteamEvent(event({}, { appid: '440' }), 0).url).toBe(
      'https://store.steampowered.com/news/app/440/view/7',
    );
    expect(toSteamEvent(event({}), 0).url).toBe(
      'https://store.steampowered.com/news/group/46255707/view/7',
    );
  });

  it('has the english capsule and summary, times in milliseconds', () => {
    expect(
      toSteamEvent(
        event({
          localized_capsule_image: ['cap.png', 'other.png'],
          localized_summary: ['Everything is cheap', null],
        }),
        0,
      ),
    ).toMatchObject({
      title: 'Big Sale',
      appid: null,
      imageUrl: 'https://clan.fastly.steamstatic.com/images/46255707/cap.png',
      summary: 'Everything is cheap',
      startsAt: 100_000,
      endsAt: 200_000,
    });
  });

  it("has the capsule and summary in the user's language, english where there is none", () => {
    expect(
      toSteamEvent(
        event({
          localized_capsule_image: ['cap.png', null],
          localized_summary: ['Everything is cheap', 'Alles ist billig'],
        }),
        1,
      ),
    ).toMatchObject({
      imageUrl: 'https://clan.fastly.steamstatic.com/images/46255707/cap.png',
      summary: 'Alles ist billig',
    });
  });

  it('summarizes the body when there is no summary, and survives broken JSON', () => {
    const summarized = toSteamEvent(
      {
        ...event({}),
        jsondata: '{',
        announcement_body: { body: '[p]Patch [b]notes[/b][/p]' },
      },
      0,
    );
    expect(summarized).toMatchObject({
      summary: 'Patch notes',
      imageUrl: null,
    });
  });
});

describe('getGameNews', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts the next page after the posts so far and ends on a page without any', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const first = url.includes('offset=0&');
      return Response.json({
        events: first ? [event({}, { gid: '1' }), event({}, { gid: '2' })] : [],
      });
    });
    const first = await getGameNews(10, null);
    expect(first.items.map(({ id }) => id)).toEqual(['1', '2']);
    expect(first.next).toBe(2);
    expect(await getGameNews(10, first.next)).toEqual({
      items: [],
      next: null,
    });
    expect(asked[1]).toContain('appid=10&offset=2&');
  });
});
