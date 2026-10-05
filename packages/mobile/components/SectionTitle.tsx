import { type StyleProp, StyleSheet, Text, type TextStyle } from 'react-native';
import { colors } from '../theme';

/** The small caps title over a section, the same on every page. */
export function SectionTitle({
  title,
  style,
}: {
  title: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.title, style]}>{title}</Text>;
}

const styles = StyleSheet.create({
  title: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
