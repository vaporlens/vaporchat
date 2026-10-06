import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, gradients } from '../theme';

export function GradientButton({
  title,
  onPress,
  disabled = false,
  busy = false,
  gradient = gradients.primary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  gradient?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        // flat when disabled, a faded gradient reads as muddy rather than off
        disabled
          ? styles.disabled
          : {
              experimental_backgroundImage: gradient,
              opacity: pressed ? 0.8 : 1,
            },
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.title, disabled && styles.disabledTitle]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  disabled: { backgroundColor: colors.surfaceRaised },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledTitle: { color: colors.muted },
});
