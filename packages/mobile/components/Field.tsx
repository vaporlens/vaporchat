import Ionicons from '@expo/vector-icons/Ionicons';
import type { Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { colors } from '../theme';
import type { IconName } from './RoundButton';

/** A Steam style text field, optionally with an icon in front. */
export function Field({
  icon,
  style,
  ref,
  ...props
}: TextInputProps & { icon?: IconName; ref?: Ref<TextInput> }) {
  return (
    <View style={styles.field}>
      {icon && <Ionicons name={icon} size={18} color={colors.muted} />}
      <TextInput
        ref={ref}
        style={[styles.input, style]}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        keyboardAppearance="dark"
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#32353c',
  },
  input: { flex: 1, height: 48, color: colors.bright, fontSize: 16 },
});
