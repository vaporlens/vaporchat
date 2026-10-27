import Ionicons from '@expo/vector-icons/Ionicons';
import { type Ref, useImperativeHandle, useState } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme';

/**
 * A header's button opening and closing a search bar, a cross while it's open. Its `ref` is told
 * whether the list shown has one, it shows only then unless `shown` fixes it. Its own state, a
 * list switching doesn't render the header's screen again.
 */
export function SearchButton({
  ref,
  shown,
  open,
  onPress,
  style,
}: {
  ref?: Ref<(searchable: boolean) => void>;
  shown?: boolean;
  open: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [searchable, setSearchable] = useState(false);
  useImperativeHandle(ref, () => setSearchable, []);
  if (!(shown ?? searchable)) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={open ? 'Close search' : 'Search'}
      hitSlop={8}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      <Ionicons
        name={open ? 'close' : 'search'}
        size={22}
        color={colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
});
