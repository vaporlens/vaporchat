import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type Tab = 'store' | 'releases' | 'feed' | 'chat';

const TABS: {
  tab: Tab;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { tab: 'store', title: 'Store', icon: 'pricetags' },
  { tab: 'releases', title: 'Releases', icon: 'sparkles' },
  { tab: 'feed', title: 'Feed', icon: 'newspaper' },
  { tab: 'chat', title: 'Chat', icon: 'chatbubbles' },
];

export function TabBar({
  tab,
  onChange,
  bottomInset,
  chatUnread,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
  bottomInset: number;
  /** a dot on Chat while any chat has new messages */
  chatUnread?: boolean;
}) {
  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + 6 }]}>
      {TABS.map((item) => {
        const color = item.tab === tab ? colors.accent : colors.muted;
        return (
          <Pressable
            key={item.tab}
            onPress={() => onChange(item.tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.tab === tab }}
            style={styles.tab}
          >
            <View>
              <Ionicons name={item.icon} size={22} color={color} />
              {item.tab === 'chat' && chatUnread && <View style={styles.dot} />}
            </View>
            <Text style={[styles.title, { color }]}>{item.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 6,
    backgroundColor: colors.bar,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  title: { fontSize: 11, fontWeight: '600' },
  dot: {
    position: 'absolute',
    top: -1,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.bar,
  },
});
