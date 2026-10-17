import { Emitter } from '../client/emitter.ts';
import type { SteamNotice, SteamNoticeKind } from '../protocol.ts';
import type { SteamCM } from './cm.ts';

const COMMUNITY = 'https://steamcommunity.com';
const STORE = 'https://store.steampowered.com';

interface NotificationData {
  notification_id: string;
  notification_type?: number;
  /** JSON, its fields differ per type */
  body_data?: string;
  read?: boolean;
  timestamp?: number;
}

/** The fields of `body_data` read here, Steam's clients have more. */
interface NoticeBody {
  appid?: number;
  /** wishlist sales of several games name them all, `appid` is the first */
  appids?: number[];
  link?: string;
  url?: string;
  ticket?: string;
  msgid?: string;
  familyid?: string;
}

const FAMILY_REQUESTS = `${STORE}/account/familymanagement?tab=requests`;

/** By ESteamNotificationType: what it is about, and the page Steam's clients open for it. */
const TYPES: Record<
  number,
  { kind: SteamNoticeKind; url: (body: NoticeBody) => string | null }
> = {
  2: { kind: 'gift', url: () => `${COMMUNITY}/my/inventory/#pending_gifts` },
  // a community path, like a profile's or a screenshot's
  3: {
    kind: 'comment',
    url: (body) =>
      body.url
        ? `${COMMUNITY}${body.url}`
        : `${COMMUNITY}/my/commentnotifications/`,
  },
  4: { kind: 'item', url: () => `${COMMUNITY}/my/inventory/` },
  5: { kind: 'friendInvite', url: () => `${COMMUNITY}/my/friends/pending` },
  6: { kind: 'sale', url: (body) => body.link ?? null },
  8: {
    kind: 'wishlist',
    url: (body) =>
      (body.appids?.length ?? 0) > 1 || !body.appid
        ? `${STORE}/wishlist/`
        : `${STORE}/app/${body.appid}/`,
  },
  9: { kind: 'tradeOffer', url: () => `${COMMUNITY}/my/tradeoffers/` },
  10: { kind: 'general', url: (body) => body.link ?? null },
  11: {
    kind: 'helpRequest',
    url: (body) =>
      body.ticket
        ? `https://help.steampowered.com/wizard/HelpRequest/${body.ticket}`
        : null,
  },
  12: { kind: 'turn', url: () => `${COMMUNITY}/my/gamenotifications/` },
  14: {
    kind: 'moderator',
    url: (body) =>
      body.msgid ? `${COMMUNITY}/my/moderatormessages/${body.msgid}` : null,
  },
  15: { kind: 'family', url: () => FAMILY_REQUESTS },
  16: {
    kind: 'family',
    url: (body) =>
      body.familyid
        ? `${STORE}/account/familymanagement/join?invitation=${body.familyid}`
        : FAMILY_REQUESTS,
  },
  17: { kind: 'family', url: () => FAMILY_REQUESTS },
  18: { kind: 'family', url: () => FAMILY_REQUESTS },
  19: { kind: 'family', url: () => FAMILY_REQUESTS },
  20: { kind: 'family', url: () => FAMILY_REQUESTS },
  21: { kind: 'family', url: () => FAMILY_REQUESTS },
  28: {
    kind: 'playtest',
    url: (body) =>
      body.appid ? `${STORE}/account/gatedaccess?appid=${body.appid}` : null,
  },
};

function parseBody(json = '') {
  try {
    return JSON.parse(json) as NoticeBody;
  } catch {
    return {};
  }
}

/** One of Steam's notifications as the app shows it. */
export function steamNotice(data: NotificationData): SteamNotice {
  const body = parseBody(data.body_data);
  const type = TYPES[data.notification_type ?? 0];
  return {
    id: data.notification_id,
    kind: type?.kind ?? 'other',
    time: (data.timestamp ?? 0) * 1000,
    read: data.read === true,
    // one game, or the notice is about several
    appid: (body.appids?.length ?? 0) > 1 ? null : (body.appid ?? null),
    url: type?.url(body) ?? null,
  };
}

/**
 * The account's Steam notifications, newest first, kept current while connected. Read ones
 * stay, like in Steam's clients.
 */
export class SteamNotices extends Emitter<{ changed: SteamNotice[] }> {
  #cm: SteamCM | null = null;
  #notices: SteamNotice[] = [];

  get current() {
    return this.#notices;
  }

  /** Once logged on: loads them, and again each time Steam says they changed. */
  async start(cm: SteamCM) {
    this.#cm = cm;
    // steam sends only the changed ones, and nothing at all for reads
    cm.onMessage('SteamNotificationClient.NotificationsReceived#1', () => {
      this.#load(cm).catch(() => {});
    });
    await this.#load(cm);
  }

  async #load(cm: SteamCM) {
    const { notifications = [] } = await cm.call<{
      notifications?: NotificationData[];
    }>('SteamNotification.GetSteamNotifications#1', { include_read: true });
    this.#notices = notifications
      .map(steamNotice)
      .sort((a, b) => b.time - a.time);
    this.emit('changed', this.#notices);
  }

  /** Marks them all read, here and on the account's other devices. */
  markAllRead() {
    if (!this.#cm?.connected || this.#notices.every((n) => n.read)) return;
    this.#cm.notify(
      'SteamNotification.MarkNotificationsRead#1',
      'CSteamNotification_MarkNotificationsRead_Notification',
      { mark_all_read: true },
    );
    this.#notices = this.#notices.map((n) => ({ ...n, read: true }));
    this.emit('changed', this.#notices);
  }
}
