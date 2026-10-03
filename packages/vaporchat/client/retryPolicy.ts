// Timings of the official client's voice connection handling.

export const CONNECT_TIMEOUT_MS = 60_000;
/** waiting for a friend to pick up */
export const RING_TIMEOUT_MS = 300_000;
export const WATCHDOG_INTERVAL_MS = 2000;

const RETRY_DELAYS_MS = [250, 1000, 1000, 5000, 5000];
const LATE_RETRY_DELAYS_MS: [maxFailures: number, delay: number][] = [
  [10, 10_000],
  [15, 30_000],
];

/** Backoff before rebuilding the connection after `failures` failed attempts in a row. */
export function retryDelay(failures: number) {
  if (failures < RETRY_DELAYS_MS.length) return RETRY_DELAYS_MS[failures];
  for (const [maxFailures, delay] of LATE_RETRY_DELAYS_MS) {
    if (failures < maxFailures) return delay;
  }
  return 60_000;
}
