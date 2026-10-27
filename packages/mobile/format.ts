import type { Friend, StoreItem } from 'vaporchat/protocol';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `Fun immediately` */
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

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

/** `Oct 5` this year, `Oct 5, 2024` before. */
export function pastDate(time: number) {
  return new Date(time).getFullYear() === new Date().getFullYear()
    ? date(time)
    : fullDate(time);
}

/** `Today`, `Yesterday`, then the date. */
export function day(time: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (time >= today.getTime()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return time >= yesterday.getTime() ? 'Yesterday' : pastDate(time);
}

/** `45 min`, `2.5 h`, `120 h` */
export function playtime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: hours < 10 ? 1 : 0 })} h`;
}

/** `today`, `tomorrow`, `in 12 days` up to 99 days ahead, otherwise null. */
function daysUntil(time: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(time);
  then.setHours(0, 0, 0, 0);
  // rounded, a DST change makes a day an hour shorter or longer
  const days = Math.round((then.getTime() - today.getTime()) / DAY);
  if (days < 0 || days > 99) return null;
  if (days === 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** `Oct 5 · in 9 days` up to 99 days ahead, the year goes without saying then; `Oct 5, 2027` after. */
export function upcomingDate(time: number) {
  const soon = daysUntil(time);
  return soon ? `${date(time)} · ${soon}` : fullDate(time);
}

/**
 * `Oct 5, 2026 · in 9 days`, or as precise as Steam knows a coming game's: `December 2026`,
 * `Q2 2027`, `2027`.
 */
export function releaseDate({ releasedAt, releaseWindow }: StoreItem) {
  if (releasedAt) {
    const soon = releasedAt > Date.now() && daysUntil(releasedAt);
    return soon ? `${fullDate(releasedAt)} · ${soon}` : fullDate(releasedAt);
  }
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
