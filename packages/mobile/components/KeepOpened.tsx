import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

// whether the screens around it are the ones shown
const Shown = createContext(true);

/** Counts taps on the tab shown, its list scrolls to the top on each. */
export const TopTaps = createContext(0);

/** Calls `scrollTop` on each tap on the tab shown, while its list is the one shown. */
export function useScrollToTop(scrollTop: () => void) {
  const taps = useContext(TopTaps);
  const shown = useContext(Shown);
  const last = useRef(taps);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per tap
  useEffect(() => {
    if (taps !== last.current && shown) scrollTop();
    last.current = taps;
  }, [taps]);
}

/**
 * Shows one of several screens. Each renders when first shown and stays (hidden) after, so
 * coming back keeps its state and scroll position. `null` shows none.
 */
export function KeepOpened<K extends string>({
  tab,
  render,
}: {
  tab: K | null;
  render: (tab: K) => ReactNode;
}) {
  const [opened, setOpened] = useState<K[]>([]);
  const shown = useContext(Shown);
  if (tab !== null && !opened.includes(tab)) setOpened([...opened, tab]);
  return opened.map((name) => (
    <View key={name} style={[styles.grow, name !== tab && styles.hidden]}>
      <Shown.Provider value={shown && name === tab}>
        {render(name)}
      </Shown.Provider>
    </View>
  ));
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  hidden: { display: 'none' },
});
