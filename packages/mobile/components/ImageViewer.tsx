import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/** An image over everything, pinch to zoom. Shown while `url` is set. */
export function ImageViewer({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal
      visible={url !== null}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.screen}>
        <ActivityIndicator color={colors.muted} style={styles.loading} />
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {url && (
            <Image
              source={{ uri: url }}
              resizeMode="contain"
              style={{ width, height }}
            />
          )}
        </ScrollView>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close image"
          hitSlop={8}
          style={({ pressed }) => [
            styles.close,
            { top: insets.top + 8 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="close" size={24} color={colors.bright} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  loading: { ...StyleSheet.absoluteFill },
  close: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  pressed: { opacity: 0.6 },
});
