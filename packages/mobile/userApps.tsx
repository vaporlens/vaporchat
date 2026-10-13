import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import { useCached } from './cache';

const UserAppSets = createContext({
  owned: new Set<number>(),
  wishlisted: new Set<number>(),
});

/** Tells the game cards under it which games the user owns and wishlisted. */
export function UserAppsProvider({
  voice,
  children,
}: {
  voice: SteamVoice;
  children: ReactNode;
}) {
  const load = useCallback(() => voice.connection.feeds.getUserApps(), [voice]);
  // without them the cards just aren't marked, no error to show
  const { data } = useCached('user-apps', load);
  const apps = useMemo(
    () => ({
      owned: new Set(data?.owned),
      wishlisted: new Set(data?.wishlisted),
    }),
    [data],
  );
  return <UserAppSets.Provider value={apps}>{children}</UserAppSets.Provider>;
}

/** Whether the user owns or wishlisted a game, null for neither and for bundles. */
export function useOwnership(
  appid: number | null,
): 'owned' | 'wishlisted' | null {
  const { owned, wishlisted } = useContext(UserAppSets);
  if (appid === null) return null;
  if (owned.has(appid)) return 'owned';
  return wishlisted.has(appid) ? 'wishlisted' : null;
}
