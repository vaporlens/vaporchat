import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/** The pills switching between the lists of a tab. */
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
    <View style={styles.bar}>
      {tabs.map((item) => {
        const selected = item.tab === tab;
        return (
          <Pressable
            key={item.tab}
            onPress={() => onChange(item.tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.pill, selected && styles.selected]}
          >
            <Text style={[styles.title, selected && styles.selectedTitle]}>
              {item.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
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
  title: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  selectedTitle: { color: colors.accent },
});
