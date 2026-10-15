import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedPage } from 'vaporchat/protocol';
import { readCache, writeCache } from '../cache';

/** Loads a page of a list: the first for null, else the one at the `next` of the last. */
export type Load<T, Next = number> = (
  next: Next | null,
) => Promise<FeedPage<T, Next>>;

/** `added` that aren't in `shown`, each once: steam sends some items again. */
function unique<T>(shown: T[], added: T[], keyOf: (item: T) => string) {
  const keys = new Set(shown.map(keyOf));
  return added.filter((item) => {
    const key = keyOf(item);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

/**
 * A list loaded from Steam a page at a time, last time's first page (under `cacheKey`) while it
 * loads. It loads again when `load` changes, `null` empties it.
 */
export function usePaging<T, Next = number>(
  load: Load<T, Next> | null,
  keyOf: (item: T) => string,
  cacheKey: string | null,
  onError: (err: Error) => void,
) {
  const [cached] = useState(() =>
    cacheKey === null ? null : readCache<FeedPage<T, Next>>(cacheKey),
  );
  const [items, setItems] = useState<T[] | null>(cached?.items ?? null);
  const [next, setNext] = useState<Next | null>(cached?.next ?? null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // a refresh outdates pages still loading
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!load) {
      setItems(null);
      setNext(null);
      return;
    }
    const page = await load(null);
    if (current !== generation.current) return;
    const first = { items: unique([], page.items, keyOf), next: page.next };
    if (cacheKey !== null) writeCache(cacheKey, first);
    setItems(first.items);
    setNext(first.next);
  }, [cacheKey, load, keyOf]);

  // failing first shows in place of the list, later refreshes keep the list and toast
  const loadFirst = useCallback(() => {
    setError(null);
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  useEffect(loadFirst, [loadFirst]);

  function pull() {
    setRefreshing(true);
    refresh()
      .catch(onError)
      .finally(() => setRefreshing(false));
  }

  async function loadMore() {
    if (!load || next === null || loadingMore || refreshing) return;
    const current = generation.current;
    setLoadingMore(true);
    try {
      const page = await load(next);
      if (current !== generation.current) return;
      const shown = items ?? [];
      const added = unique(shown, page.items, keyOf);
      setItems([...shown, ...added]);
      // a page of nothing new is the end, steam would keep sending the same
      setNext(added.length > 0 ? page.next : null);
    } catch (err) {
      onError(err as Error);
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    /** null until the first page loads */
    items,
    next,
    /** why the first page didn't load */
    error,
    refreshing,
    loadingMore,
    loadFirst,
    pull,
    loadMore,
  };
}
