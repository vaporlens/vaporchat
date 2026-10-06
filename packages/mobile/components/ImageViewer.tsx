import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { LoopingVideo } from './LoopingVideo';
import { useLastShown } from './useLastShown';

const VIDEO = /\.(webm|mp4)(\?|$)/i;

/** An image or video over everything, pinch to zoom. Shown while `url` is set. */
export function ImageViewer({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // by URL, so the next one opened starts out loading
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const shown = useLastShown(url);
  const onError = () => setFailedUrl(shown);
  return (
    <Modal
      visible={url !== null}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.screen}>
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {/* behind the media, moving with it, covered once it shows */}
          {shown !== null && shown === failedUrl ? (
            <View style={styles.behind}>
              <Ionicons
                name="alert-circle-outline"
                size={32}
                color={colors.muted}
              />
              <Text style={styles.failed}>Could not load</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.muted} style={styles.behind} />
          )}
          {shown &&
            (VIDEO.test(shown) ? (
              <LoopingVideo
                url={shown}
                posterUrl={null}
                style={{ width, height }}
                onError={onError}
              />
            ) : (
              <Image
                source={{ uri: shown }}
                resizeMode="contain"
                style={{ width, height }}
                onError={onError}
              />
            ))}
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
  behind: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  failed: { color: colors.muted, fontSize: 15 },
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
