import { type ReactElement, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Shows one of several screens. Each renders when first shown and stays (hidden) after, so
 * coming back keeps its state and scroll position. `null` shows none.
 */
export function KeepOpened<K extends string>({
  tab,
  render,
}: {
  tab: K | null;
  render: (tab: K) => ReactElement;
}) {
  const [opened, setOpened] = useState<K[]>([]);
  if (tab !== null && !opened.includes(tab)) setOpened([...opened, tab]);
  return opened.map((name) => (
    <View key={name} style={[styles.grow, name !== tab && styles.hidden]}>
      {render(name)}
    </View>
  ));
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  hidden: { display: 'none' },
});
