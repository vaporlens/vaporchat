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

/** `5m ago`, `3h ago`, `2d ago`, then the date. */
export function timeAgo(time: number) {
  const ago = Date.now() - time;
  if (ago < HOUR) return `${Math.max(1, Math.floor(ago / MINUTE))}m ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d ago`;
  return date(time);
}
