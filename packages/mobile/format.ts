import type { Friend, StoreItem } from 'vaporchat/protocol';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `Oct 5` */
export function date(time: number) {
  return new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** `Oct 5, 2026` */
export function fullDate(time: number) {
  return new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** `Oct 5, 2026`, or as precise as Steam knows a coming game's: `December 2026`, `Q2 2027`, `2027`. */
export function releaseDate({ releasedAt, releaseWindow }: StoreItem) {
  if (releasedAt) return fullDate(releasedAt);
  // pages cached before windows were loaded have none
  if (!releaseWindow) return null;
  const day = new Date(releaseWindow.at);
  if (releaseWindow.precision === 'month') {
    return day.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  return releaseWindow.precision === 'quarter'
    ? `Q${Math.floor(day.getMonth() / 3) + 1} ${day.getFullYear()}`
    : String(day.getFullYear());
}

/** What a friend is up to: `Playing Some Game`, `Away`, `Online`, `Offline`… */
export function friendStatus({ online, away, game }: Friend) {
  if (!online) return 'Offline';
  if (game) return game.name ? `Playing ${game.name}` : 'In game';
  if (away === 'snooze') return 'Snooze';
  return away === 'away' ? 'Away' : 'Online';
}

/** `5m ago`, `3h ago`, `2d ago`, then the date. */
export function timeAgo(time: number) {
  const ago = Date.now() - time;
  if (ago < HOUR) return `${Math.max(1, Math.floor(ago / MINUTE))}m ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d ago`;
  return date(time);
}
