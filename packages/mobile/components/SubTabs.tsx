import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.bar}
    >
      {tabs.map((item) => {
        const selected = item.tab === tab;
        return (
          <Pressable
            key={item.tab}
            onPress={() => onChange(item.tab)}
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
