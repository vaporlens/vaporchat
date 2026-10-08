import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { FeedPage } from 'vaporchat/protocol';
import { readCache, writeCache } from '../cache';
import { colors, gridGutter } from '../theme';

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
 * A list loaded from Steam: last time's first page while it loads, pull to refresh, more as it
 * scrolls to the end (when `load` pages), errors in place of an empty list.
 */
export function Feed<T>({
  cacheKey,
  load,
  keyOf,
  columns = 1,
  renderItem,
  empty,
  header,
  extraData,
  onError,
}: {
  /** where its first page is cached */
  cacheKey: string;
  /** a stable function, the feed loads again when it changes */
  load: (next: number | null) => Promise<FeedPage<T>>;
  /** a stable function, telling items apart */
  keyOf: (item: T) => string;
  /** rows of this many items, each padded by `gridGutter` */
  columns?: number;
  renderItem: (item: T) => ReactElement;
  empty: string;
  /** over the rows, shown while they load too */
  header?: ReactElement;
  /** rows render again when it changes */
  extraData?: unknown;
  onError: (err: Error) => void;
}) {
  const [cached] = useState(() => readCache<FeedPage<T>>(cacheKey));
  const [items, setItems] = useState<T[] | null>(cached?.items ?? null);
  const [next, setNext] = useState<number | null>(cached?.next ?? null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // a refresh outdates pages still loading
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const page = await load(null);
    if (current !== generation.current) return;
    const first = { items: unique([], page.items, keyOf), next: page.next };
    writeCache(cacheKey, first);
    setItems(first.items);
    setNext(first.next);
  }, [cacheKey, load, keyOf]);

  // failing first shows in place of the list, later refreshes keep the list and toast
  const loadFirst = useCallback(() => {
    setError(null);
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  useEffect(loadFirst, [loadFirst]);

  async function loadMore() {
    if (next === null || loadingMore || refreshing) return;
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

  return (
    <FlatList
      data={items ?? []}
      keyExtractor={keyOf}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      renderItem={({ item }) => renderItem(item)}
      extraData={extraData}
      contentContainerStyle={styles.content}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={1}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.muted}
          onRefresh={() => {
            setRefreshing(true);
            refresh()
              .catch(onError)
              .finally(() => setRefreshing(false));
          }}
        />
      }
      ListHeaderComponent={header}
      ListEmptyComponent={
        items !== null ? (
          <Text style={styles.message}>{empty}</Text>
        ) : (
          <View style={styles.center}>
            {error === null ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <>
                <Text style={styles.message}>{error}</Text>
                <Pressable
                  onPress={loadFirst}
                  style={({ pressed }) => [
                    styles.retry,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </>
            )}
          </View>
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator color={colors.muted} style={styles.more} />
        ) : next === null && (items?.length ?? 0) > 0 ? (
          <Text style={styles.message}>That's all.</Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  // grows so the loading state centers in the space left
  content: { flexGrow: 1, paddingVertical: 12 },
  row: { paddingHorizontal: gridGutter },
  message: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
  },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: colors.accentBackground,
  },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  more: { padding: 16 },
});
