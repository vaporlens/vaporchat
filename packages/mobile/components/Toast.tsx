import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

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

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <Pressable
      onPress={onDismiss}
      style={[styles.toast, { top: insets.top + 8 }]}
    >
      <Ionicons name="alert-circle" size={22} color={colors.danger} />
      <Text style={styles.text}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#3a2224',
    borderWidth: 1,
    borderColor: '#5c2b2b',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
  text: { flex: 1, color: colors.bright, fontSize: 14 },
});
