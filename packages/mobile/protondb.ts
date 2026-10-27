import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

// ProtonDB (protondb.com) rates how games run on Linux through Proton, from players' reports.
const SITE_URL = 'https://www.protondb.com';
const SETTING_KEY = 'show-protondb';

export type ProtonDbTier =
  | 'platinum'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'borked'
  | 'pending';

/** ProtonDB's verdict on a game, only what the app shows. */
export interface ProtonDbSummary {
  /** from all reports */
  tier: ProtonDbTier;
  /** from recent reports */
  trendingTier: ProtonDbTier;
  /** reports */
  total: number;
}

export function protonDbUrl(appid: number) {
  return `${SITE_URL}/app/${appid}`;
}

/** The game's verdict, null when nobody reported on it. */
export async function getProtonDbSummary(
  appid: number,
): Promise<ProtonDbSummary | null> {
  // not a documented API, the one protondb.com's own pages use
  const response = await fetch(
    `${SITE_URL}/api/v1/reports/summaries/${appid}.json`,
  );
  // a 404 for games without reports, other failures keep the cached verdict
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ProtonDB answered ${response.status}`);
  return (await response.json()) as ProtonDbSummary;
}

/** Whether game pages show ProtonDB's verdict, kept on this device. Off until turned on. */
export function useShowProtonDb() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync(SETTING_KEY)
      .then((saved) => setOn(saved === 'on'))
      // unread, it stays off
      .catch(() => {});
  }, []);
  const change = useCallback((next: boolean) => {
    setOn(next);
    SecureStore.setItemAsync(SETTING_KEY, next ? 'on' : 'off').catch(() => {});
  }, []);
  return { on, change };
}
