import { describe, expect, it } from 'vitest';
import type { SteamCM } from './cm.ts';
import { encodeProto } from './protos.ts';
import { SteamNotices, steamNotice } from './steamNotifications.ts';

const RECEIVED = 'SteamNotificationClient.NotificationsReceived#1';

/** Answers the notification list with whatever `list` holds then, records notifies. */
function fakeSteam(list: object[]) {
  const handlers = new Map<
    string,
    (header: object, body: Uint8Array) => void
  >();
  const notified: { method: string; body: object }[] = [];
  const cm = {
    connected: true,
    onMessage(
      key: string,
      handler: (header: object, body: Uint8Array) => void,
    ) {
      handlers.set(key, handler);
      return () => {};
    },
    async call() {
      return { notifications: list };
    },
    notify(method: string, _typeName: string, body: object) {
      notified.push({ method, body });
    },
  };
  return {
    cm: cm as unknown as SteamCM,
    notified,
    received: () =>
      handlers.get(RECEIVED)?.(
        {},
        encodeProto(
          'CSteamNotification_NotificationsReceived_Notification',
          {},
        ),
      ),
  };
}

describe('steamNotice', () => {
  it('reads the game a wishlist sale is about', () => {
    expect(
      steamNotice({
        notification_id: '1',
        notification_type: 8,
        body_data: '{"appid":440,"count":1,"appids":[440]}',
        read: false,
        timestamp: 1_700_000_000,
      }),
    ).toEqual({
      id: '1',
      kind: 'wishlist',
      time: 1_700_000_000_000,
      read: false,
      appid: 440,
      url: 'https://store.steampowered.com/app/440/',
    });
  });

  it('sends a sale of several wishlisted games to the wishlist', () => {
    const notice = steamNotice({
      notification_id: '5',
      notification_type: 8,
      body_data: '{"appid":440,"count":2,"appids":[440,620]}',
    });
    expect([notice.appid, notice.url]).toEqual([
      null,
      'https://store.steampowered.com/wishlist/',
    ]);
  });

  it("links what the body names, and doesn't take an item's app for a game", () => {
    const item = steamNotice({
      notification_id: '2',
      notification_type: 4,
      body_data: '{"app_id":753,"context_id":"6","asset_id":"9"}',
    });
    expect([item.kind, item.appid, item.url]).toEqual([
      'item',
      null,
      'https://steamcommunity.com/my/inventory/',
    ]);
    const help = steamNotice({
      notification_id: '3',
      notification_type: 11,
      body_data: '{"ticket":"AB12"}',
    });
    expect(help.url).toBe(
      'https://help.steampowered.com/wizard/HelpRequest/AB12',
    );
  });

  it('keeps unknown types and unreadable bodies, without a link', () => {
    const notice = steamNotice({
      notification_id: '4',
      notification_type: 99,
      body_data: 'not json',
    });
    expect([notice.kind, notice.appid, notice.url]).toEqual([
      'other',
      null,
      null,
    ]);
  });
});

describe('SteamNotices', () => {
  const older = { notification_id: '1', notification_type: 4, timestamp: 1 };
  const newer = { notification_id: '2', notification_type: 4, timestamp: 2 };

  it('loads them newest first, and again when Steam says they changed', async () => {
    const list = [older];
    const steam = fakeSteam(list);
    const notices = new SteamNotices();
    await notices.start(steam.cm);
    expect(notices.current.map((n) => n.id)).toEqual(['1']);
    const changed = new Promise((resolve) => notices.on('changed', resolve));
    list.push(newer);
    steam.received();
    await changed;
    expect(notices.current.map((n) => n.id)).toEqual(['2', '1']);
  });

  it('marks them all read on Steam once', async () => {
    const steam = fakeSteam([older, { ...newer, read: true }]);
    const notices = new SteamNotices();
    await notices.start(steam.cm);
    notices.markAllRead();
    notices.markAllRead();
    expect(notices.current.every((n) => n.read)).toBe(true);
    expect(steam.notified).toEqual([
      {
        method: 'SteamNotification.MarkNotificationsRead#1',
        body: { mark_all_read: true },
      },
    ]);
  });
});
