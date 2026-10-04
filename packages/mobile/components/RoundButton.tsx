import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/** A round icon button with a label below, like the controls of a phone call. */
export function RoundButton({
  icon,
  label,
  onPress,
  active = false,
  background,
  size = 56,
  rotate,
}: {
  icon: IconName;
  label?: string;
  onPress: () => void;
  /** a toggle that is on, drawn inverted */
  active?: boolean;
  background?: string;
  size?: number;
  /** turns the handset icon into a hang up one */
  rotate?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: active
              ? colors.bright
              : (background ?? colors.surfaceRaised),
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={size * 0.45}
          color={active ? colors.background : colors.bright}
          style={rotate ? { transform: [{ rotate }] } : undefined}
        />
      </Pressable>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  button: { alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.muted, fontSize: 12 },
});
