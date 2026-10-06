import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Appear } from './Appear';
import { useLastShown } from './useLastShown';

export interface Info {
  title: string;
  /** a line under the title, like a verdict */
  subtitle?: string;
  body: string;
}

/** A sheet from the bottom with a longer text, shown while `info` is set. Tap outside to close. */
export function InfoSheet({
  info,
  onClose,
}: {
  info: Info | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const shown = useLastShown(info);
  return (
    // fading, the backdrop stays in place while the sheet rises over it
    <Modal
      visible={info !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Appear
        from="bottom"
        style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.header}>
          <View style={styles.grow}>
            <Text style={styles.title}>{shown?.title}</Text>
            {shown?.subtitle ? (
              <Text style={styles.subtitle}>{shown.subtitle}</Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView>
          <Text style={styles.body}>{shown?.body}</Text>
        </ScrollView>
      </Appear>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  sheet: {
    maxHeight: '70%',
    gap: 12,
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  grow: { flex: 1, gap: 2 },
  title: { color: colors.bright, fontSize: 17, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
