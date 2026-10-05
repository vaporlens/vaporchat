import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openLink } from '../links';
import { colors } from '../theme';

/** The bar over a pushed screen: back, its picture and title, and opening it on Steam. */
export function DetailHeader({
  title,
  subtitle,
  avatar,
  steamUrl,
  onBack,
}: {
  title: string;
  subtitle?: string;
  avatar?: ReactNode;
  steamUrl?: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable
        onPress={onBack}
        accessibilityLabel="Back"
        hitSlop={8}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={26} color={colors.bright} />
      </Pressable>
      {avatar}
      <View style={styles.grow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {steamUrl && (
        <Pressable
          onPress={() => openLink(steamUrl)}
          accessibilityLabel="Open on Steam"
          hitSlop={8}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Ionicons name="open-outline" size={22} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: colors.bar,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  button: { padding: 4 },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  title: { color: colors.bright, fontSize: 17, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 1 },
});
