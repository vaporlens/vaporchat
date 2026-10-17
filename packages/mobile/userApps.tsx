import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import { useCached } from './cache';

const UserAppSets = createContext({
  owned: new Set<number>(),
  wishlisted: new Set<number>(),
  markWishlisted: (_appid: number, _on: boolean) => {},
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
  // changed here since, steam's list can lag behind
  const [changes, setChanges] = useState(new Map<number, boolean>());
  const markWishlisted = useCallback(
    (appid: number, on: boolean) =>
      setChanges((changed) => new Map(changed).set(appid, on)),
    [],
  );
  const apps = useMemo(() => {
    const wishlisted = new Set(data?.wishlisted);
    for (const [appid, on] of changes) {
      if (on) wishlisted.add(appid);
      else wishlisted.delete(appid);
    }
    return { owned: new Set(data?.owned), wishlisted, markWishlisted };
  }, [data, changes, markWishlisted]);
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

/** Shows a game on or off the wishlist everywhere, after changing it on Steam. */
export function useMarkWishlisted() {
  return useContext(UserAppSets).markWishlisted;
}
