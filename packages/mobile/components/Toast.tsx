import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useLastShown } from './useLastShown';

const SHOWN_MS = 5000;

/** An error floating over the top of the screen, gone after a few seconds or a tap. */
export function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  // the last message stays while it slides away
  const shown = useLastShown(message);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: message ? 1 : 0,
      // settles without bouncing past where it stops
      bounciness: 0,
      speed: 16,
      useNativeDriver: true,
    }).start();
    if (!message) return;
    const timer = setTimeout(onDismiss, SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss, progress]);

  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents={message ? 'auto' : 'none'}
      style={[
        styles.toast,
        {
          top: insets.top + 8,
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable onPress={onDismiss} style={styles.content}>
        <Ionicons name="alert-circle" size={22} color={colors.danger} />
        <Text style={styles.text}>{shown}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 10,
    backgroundColor: '#3a2224',
    borderWidth: 1,
    borderColor: '#5c2b2b',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  text: { flex: 1, color: colors.bright, fontSize: 14 },
});
