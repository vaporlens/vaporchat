import { Fragment, type ReactElement, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useOnScreen } from '../components/onScreen';
import { colors } from '../theme';
import { type Load, usePaging } from './usePaging';

/**
 * A list inside a scrolling page, loaded a page at a time, the next once scrolled to its end.
 * Unlike `Feed` it doesn't scroll itself, so it can sit under the page's other content.
 */
export function PagedList<T, Next>({
  load,
  keyOf,
  cacheKey,
  empty,
  renderItem,
  onError,
}: {
  load: Load<T, Next>;
  keyOf: (item: T) => string;
  cacheKey: string;
  /** shown when there are none */
  empty: string;
  renderItem: (item: T) => ReactElement;
  /** a later page failing, scrolling to the end again retries */
  onError: (err: Error) => void;
}) {
  const list = usePaging(load, keyOf, cacheKey, onError);
  const end = useRef<View>(null);
  const onEndLayout = useOnScreen(end, (visible, settled) => {
    // once scrolling pauses, a failing page isn't asked for on every scroll event
    if (visible && settled) list.loadMore();
  });

  if (!list.items) {
    return list.error ? (
      <Text style={styles.muted}>{list.error}</Text>
    ) : (
      <ActivityIndicator color={colors.muted} style={styles.loading} />
    );
  }
  if (list.items.length === 0) {
    return <Text style={styles.muted}>{empty}</Text>;
  }
  return (
    <>
      {list.items.map((item) => (
        <Fragment key={keyOf(item)}>{renderItem(item)}</Fragment>
      ))}
      {list.next !== null && (
        <View ref={end} onLayout={onEndLayout}>
          <ActivityIndicator color={colors.muted} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  muted: { color: colors.muted, fontSize: 13 },
});
