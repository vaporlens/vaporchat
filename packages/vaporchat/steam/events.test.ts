import { describe, expect, it } from 'vitest';
import { type ApiEvent, toSteamEvent } from './events.ts';

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
      ).url,
    ).toBe('https://store.steampowered.com/sale/BigSale');
    expect(toSteamEvent(event({ sale_vanity_id: 'BigSale' })).url).toBe(
      'https://store.steampowered.com/curator/46255707/sale/BigSale',
    );
  });

  it("links posts without a sale page to their game's or group's news", () => {
    expect(toSteamEvent(event({}, { appid: '440' })).url).toBe(
      'https://store.steampowered.com/news/app/440/view/7',
    );
    expect(toSteamEvent(event({})).url).toBe(
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

  it('summarizes the body when there is no summary, and survives broken JSON', () => {
    const summarized = toSteamEvent({
      ...event({}),
      jsondata: '{',
      announcement_body: { body: '[p]Patch [b]notes[/b][/p]' },
    });
    expect(summarized).toMatchObject({
      summary: 'Patch notes',
      imageUrl: null,
    });
  });
});
