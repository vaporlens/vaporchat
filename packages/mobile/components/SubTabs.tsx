import { useEffect, useRef } from 'react';
import {
  type LayoutRectangle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { colors } from '../theme';

/** The pills switching between the lists of a tab, scrolling sideways when they don't fit. */
export function SubTabs<K extends string>({
  tabs,
  tab,
  onChange,
}: {
  tabs: { tab: K; title: string }[];
  tab: K;
  onChange: (tab: K) => void;
}) {
  // the selected pill centered, each list showing its own bar would start scrolled to the first
  const scroll = useRef<ScrollView>(null);
  const width = useRef(0);
  const pills = useRef(new Map<K, LayoutRectangle>());
  const center = (animated: boolean) => {
    const pill = pills.current.get(tab);
    if (!pill || !width.current) return;
    const x = pill.x + pill.width / 2 - width.current / 2;
    scroll.current?.scrollTo({ x: Math.max(0, x), animated });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: centers on switching only
  useEffect(() => center(true), [tab]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
        center(false);
      }}
      showsHorizontalScrollIndicator={false}
      // a pill switches with the keyboard up, not only closes it
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.bar}
    >
      {tabs.map((item) => {
        const selected = item.tab === tab;
        return (
          <Pressable
            key={item.tab}
            onPress={() => onChange(item.tab)}
            onLayout={(event) => {
              pills.current.set(item.tab, event.nativeEvent.layout);
              if (selected) center(false);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.pill,
              selected && styles.selected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.title, selected && styles.selectedTitle]}>
              {item.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // scroll views grow by default, over a sign-in prompt they'd take its height
  scroll: { flexGrow: 0 },
  bar: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.accentBackground },
  pressed: { opacity: 0.7 },
  title: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  selectedTitle: { color: colors.accent },
});
