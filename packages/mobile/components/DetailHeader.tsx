import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openLink } from '../links';
import { colors } from '../theme';

/**
 * Whether a scroll view is scrolled past `offset`, for a page whose own big title is in its
 * content: the header shows the title once that one scrolled away. Pass `onScroll` on.
 */
export function useScrolledPast(offset: number) {
  const [past, setPast] = useState(false);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setPast(event.nativeEvent.contentOffset.y > offset),
    [offset],
  );
  return { past, onScroll };
}

/** The bar over a pushed screen: back, its picture and title, and opening it on Steam. */
export function DetailHeader({
  title,
  subtitle,
  avatar,
  steamUrl,
  action,
  titleShown = true,
  onBack,
}: {
  title: string;
  subtitle?: string;
  avatar?: ReactNode;
  steamUrl?: string;
  /** a button of the screen's own, at the end */
  action?: ReactNode;
  /** fades the title out, while the page shows it big itself */
  titleShown?: boolean;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const titleOpacity = useRef(new Animated.Value(titleShown ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(titleOpacity, {
      toValue: titleShown ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [titleOpacity, titleShown]);
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
      <Animated.View style={[styles.grow, { opacity: titleOpacity }]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>
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
      {action}
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
