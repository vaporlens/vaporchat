import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { StoreItem } from 'vaporchat/protocol';
import { useCached } from './cache';

const HIDDEN_KEY = 'hidden-in-store';

/** Which of the user's games the store's lists leave out. */
export type HiddenInStore = { owned: boolean; wishlisted: boolean };

const UserAppSets = createContext({
  owned: new Set<number>(),
  wishlisted: new Set<number>(),
  markWishlisted: (_appid: number, _on: boolean) => {},
  /** a new one after each `markWishlisted` */
  wishlistChanges: new Map<number, boolean>(),
  hidden: { owned: false, wishlisted: false } as HiddenInStore,
  setHidden: (_hidden: HiddenInStore) => {},
});

/**
 * Tells the game cards under it which games the user owns and wishlisted, and the store's lists
 * which of them to leave out (kept on this device).
 */
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
  const [hidden, setHiddenState] = useState<HiddenInStore>({
    owned: false,
    wishlisted: false,
  });
  useEffect(() => {
    SecureStore.getItemAsync(HIDDEN_KEY)
      .then(
        (saved) => saved && setHiddenState(JSON.parse(saved) as HiddenInStore),
      )
      // unread, nothing is hidden
      .catch(() => {});
  }, []);
  const setHidden = useCallback((next: HiddenInStore) => {
    setHiddenState(next);
    SecureStore.setItemAsync(HIDDEN_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  const apps = useMemo(() => {
    const wishlisted = new Set(data?.wishlisted);
    for (const [appid, on] of changes) {
      if (on) wishlisted.add(appid);
      else wishlisted.delete(appid);
    }
    return {
      owned: new Set(data?.owned),
      wishlisted,
      markWishlisted,
      wishlistChanges: changes,
      hidden,
      setHidden,
    };
  }, [data, changes, markWishlisted, hidden, setHidden]);
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

/** Changes after each game put on or taken off the wishlist here. */
export function useWishlistChanges() {
  return useContext(UserAppSets).wishlistChanges;
}

/** Which of the user's games the store's lists leave out, and changing it. */
export function useHiddenInStore() {
  const { hidden, setHidden } = useContext(UserAppSets);
  return { hidden, setHidden };
}

/** Whether the store's lists leave a game out, undefined while they leave none out. */
export function useHideInStore() {
  const { owned, wishlisted, hidden } = useContext(UserAppSets);
  return useMemo(
    () =>
      hidden.owned || hidden.wishlisted
        ? (item: StoreItem) =>
            item.appid !== null &&
            ((hidden.owned && owned.has(item.appid)) ||
              (hidden.wishlisted && wishlisted.has(item.appid)))
        : undefined,
    [owned, wishlisted, hidden],
  );
}
