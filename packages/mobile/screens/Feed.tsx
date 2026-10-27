import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
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
import { SearchBar } from '../components/Field';
import { matches } from '../search';
import { colors, gridGutter } from '../theme';
import { type Load, usePaging } from './usePaging';

/** What a feed's search bar looks for. */
export type Search<T> = { placeholder: string } & (
  | {
      /** a stable function: Steam's results, shown in place of the list */
      find: (query: string, next: number | null) => Promise<FeedPage<T>>;
    }
  | {
      /** the list's items with the query in their text, the whole list loads for it */
      textOf: (item: T) => string;
    }
);

// steam is asked once typing stops for a while, not for every letter
const TYPING_MS = 3500;

/**
 * A list loaded from Steam: last time's first page while it loads, pull to refresh, more as it
 * scrolls to the end (when `load` pages), errors in place of an empty list. With `search`, a
 * search bar under the header while `searchOpen`, closing it shows the whole list again.
 */
export function Feed<T>({
  cacheKey,
  load,
  keyOf,
  columns = 1,
  renderItem,
  empty,
  header,
  search,
  searchOpen = false,
  onCloseSearch,
  hide,
  extraData,
  onError,
}: {
  /** where its first page is cached */
  cacheKey: string;
  /** a stable function, the feed loads again when it changes */
  load: Load<T>;
  /** a stable function, telling items apart */
  keyOf: (item: T) => string;
  /** rows of this many items, each padded by `gridGutter` */
  columns?: number;
  renderItem: (item: T) => ReactElement;
  empty: string;
  /** over the rows, shown while they load too */
  header?: ReactElement;
  search?: Search<T>;
  /** shows the search bar, scrolled to the top */
  searchOpen?: boolean;
  /** the bar's close button */
  onCloseSearch?: () => void;
  /** items the list leaves out, Steam's search results keep them */
  hide?: (item: T) => boolean;
  /** rows render again when it changes */
  extraData?: unknown;
  onError: (err: Error) => void;
}) {
  const [query, setQuery] = useState('');
  // what steam is asked for, once typing stops or the keyboard's search key is pressed
  const [sentQuery, setSentQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSentQuery(query.trim()), TYPING_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = query.trim() !== '';
  const find = search && 'find' in search ? search.find : null;
  const textOf = search && 'textOf' in search ? search.textOf : null;
  const findSent = useMemo(
    () =>
      find && sentQuery !== ''
        ? (next: number | null) => find(sentQuery, next)
        : null,
    [find, sentQuery],
  );
  const list = usePaging(load, keyOf, cacheKey, onError);
  const found = usePaging(findSent, keyOf, null, onError);
  const finding = find !== null && searching;
  const shown = finding ? found : list;
  const filtering = textOf !== null && searching;
  const items = useMemo(() => {
    const listed = filtering
      ? shown.items?.filter((item) => matches(query, textOf(item)))
      : shown.items;
    return hide && !finding ? listed?.filter((item) => !hide(item)) : listed;
  }, [filtering, finding, hide, query, textOf, shown.items]);

  // pages whose items are all hidden show nothing, the next one loads in their place
  const allHidden = hide !== undefined && !finding && items?.length === 0;
  // a filter goes through the whole list, it loads the rest a page at a time. Failing stops it
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per page loaded
  useEffect(() => {
    if (filtering || allHidden) void list.loadMore();
  }, [filtering, allHidden, list.next]);

  const ref = useRef<FlatList<T>>(null);
  useEffect(() => {
    if (searchOpen) ref.current?.scrollToOffset({ offset: 0, animated: true });
    else {
      setQuery('');
      setSentQuery('');
    }
  }, [searchOpen]);
  // stable, rows don't render again on every letter typed
  const renderRow = useCallback(
    ({ item }: { item: T }) => renderItem(item),
    [renderItem],
  );

  return (
    <View style={styles.frame}>
      <FlatList
        ref={ref}
        data={items ?? []}
        keyExtractor={keyOf}
        numColumns={columns}
        // the default keeps 10 screens of rows on either side, for each list kept open
        windowSize={7}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        renderItem={renderRow}
        extraData={extraData}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => void shown.loadMore()}
        onEndReachedThreshold={1}
        refreshControl={
          <RefreshControl
            refreshing={shown.refreshing}
            tintColor={colors.muted}
            onRefresh={shown.pull}
          />
        }
        ListHeaderComponent={
          <>
            {header}
            {search && searchOpen && (
              <SearchBar
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => setSentQuery(query.trim())}
                placeholder={search.placeholder}
                onClose={onCloseSearch}
              />
            )}
          </>
        }
        ListEmptyComponent={
          items ? (
            // the rest of the list may still match
            shown.loadingMore ? null : (
              <Text style={styles.message}>
                {searching ? 'No matches.' : empty}
              </Text>
            )
          ) : (
            <View style={styles.center}>
              {shown.error === null ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <>
                  <Text style={styles.message}>{shown.error}</Text>
                  <Pressable
                    onPress={shown.loadFirst}
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
          shown.loadingMore ? (
            <ActivityIndicator color={colors.muted} style={styles.more} />
          ) : shown.next === null && (items?.length ?? 0) > 0 ? (
            <Text style={styles.message}>That's all.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  // grows so the loading state centers in the space left
  // the header's pills have their own space over them
  content: { flexGrow: 1, paddingBottom: 12 },
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
