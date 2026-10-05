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
import { colors } from '../theme';

/**
 * A list loaded from Steam: pull to refresh, more as it scrolls to the end (when `load`
 * pages), errors in place of an empty list.
 */
export function Feed<T>({
  load,
  keyOf,
  renderItem,
  empty,
  extraData,
  onError,
}: {
  /** a stable function, the feed loads again when it changes */
  load: (before: number | null) => Promise<FeedPage<T>>;
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  empty: string;
  /** rows render again when it changes */
  extraData?: unknown;
  onError: (err: Error) => void;
}) {
  const [items, setItems] = useState<T[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // a refresh outdates pages still loading
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const page = await load(null);
    if (current !== generation.current) return;
    setItems(page.items);
    setNext(page.next);
  }, [load]);

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
      setItems((shown) => [...(shown ?? []), ...page.items]);
      setNext(page.next);
    } catch (err) {
      onError(err as Error);
    } finally {
      setLoadingMore(false);
    }
  }

  if (items === null) {
    return (
      <View style={styles.center}>
        {error === null ? (
          <ActivityIndicator color={colors.muted} />
        ) : (
          <>
            <Text style={styles.message}>{error}</Text>
            <Pressable
              onPress={loadFirst}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={keyOf}
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
      ListEmptyComponent={<Text style={styles.message}>{empty}</Text>}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator color={colors.muted} style={styles.more} />
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
  content: { paddingVertical: 12 },
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
    backgroundColor: 'rgba(26, 159, 255, 0.15)',
  },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  more: { padding: 16 },
});
