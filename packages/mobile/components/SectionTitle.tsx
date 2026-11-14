import { useRef } from 'react';
import { type StyleProp, StyleSheet, Text, type TextStyle } from 'react-native';
import { colors } from '../theme';
import { useSection } from './FastScroll';

/** The small caps title over a section, the same on every page, labelling the scroll handle. */
export function SectionTitle({
  title,
  style,
}: {
  title: string;
  style?: StyleProp<TextStyle>;
}) {
  const ref = useRef<Text>(null);
  useSection(ref, title);
  return (
    <Text ref={ref} style={[styles.title, style]}>
      {title}
    </Text>
  );
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
