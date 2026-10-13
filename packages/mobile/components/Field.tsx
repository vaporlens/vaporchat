import Ionicons from '@expo/vector-icons/Ionicons';
import type { Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { colors } from '../theme';
import type { IconName } from './RoundButton';

/** A Steam style text field, optionally with an icon in front. */
export function Field({
  icon,
  style,
  ref,
  ...props
}: TextInputProps & { icon?: IconName; ref?: Ref<TextInput> }) {
  // iOS draws the clear button `clearButtonMode` asks for, Android has none of its own
  const clearable =
    Platform.OS === 'android' &&
    (props.clearButtonMode ?? 'never') !== 'never' &&
    !!props.value;
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
      {clearable && (
        <Pressable
          onPress={() => props.onChangeText?.('')}
          accessibilityLabel="Clear"
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** A field searching as the user types: a search icon, no autocorrect, a clear button. */
export function SearchField(props: TextInputProps & { ref?: Ref<TextInput> }) {
  return (
    <Field
      icon="search"
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType="search"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: colors.field,
  },
  input: { flex: 1, height: 48, color: colors.bright, fontSize: 16 },
});
