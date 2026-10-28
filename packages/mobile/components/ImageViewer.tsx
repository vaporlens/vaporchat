import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { LoopingVideo } from './LoopingVideo';
import { SwipeBack, swipesBack } from './SwipeBack';
import { useLastShown } from './useLastShown';
import { Zoomable } from './Zoomable';

const VIDEO = /\.(webm|mp4)(\?|$)/i;
/** One of the viewer's images or videos, pinch to zoom. */
function Shown({
  url,
  onZoom,
}: {
  url: string;
  onZoom: (zoomed: boolean) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const onError = () => setFailed(true);
  return (
    <View style={{ width, height }}>
      <Zoomable onZoom={onZoom}>
        {/* behind the media, moving with it, covered once it shows */}
        {failed ? (
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
        {VIDEO.test(url) ? (
          <LoopingVideo
            url={url}
            posterUrl={null}
            style={{ width, height }}
            onError={onError}
          />
        ) : (
          <Image
            source={{ uri: url }}
            resizeMode="contain"
            style={{ width, height }}
            onError={onError}
          />
        )}
      </Zoomable>
    </View>
  );
}

/** `urls` side by side from `start`, swiped through. Mounted each time the viewer opens. */
function Pages({ urls, start }: { urls: string[]; start: number }) {
  const { width } = useWindowDimensions();
  // a drag moves a zoomed in one around instead
  const [zoomed, setZoomed] = useState(false);
  return (
    <FlatList
      data={urls}
      keyExtractor={(url) => url}
      renderItem={({ item }) => <Shown url={item} onZoom={setZoomed} />}
      horizontal
      pagingEnabled
      scrollEnabled={urls.length > 1 && !zoomed}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={start}
      getItemLayout={(_data, i) => ({
        length: width,
        offset: width * i,
        index: i,
      })}
      // full size images, only the ones next to it load ahead
      windowSize={3}
      initialNumToRender={1}
    />
  );
}

/**
 * An image or video over everything, pinch to zoom. Shown while `url` is set, swiped left and
 * right through `gallery` when it is one of them.
 */
export function ImageViewer({
  url,
  gallery,
  onClose,
}: {
  url: string | null;
  gallery?: string[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const shown = useLastShown(url === null ? null : { url, gallery });
  const urls = shown?.gallery?.includes(shown.url)
    ? shown.gallery
    : shown
      ? [shown.url]
      : [];
  return (
    // see-through, a swipe back shows the page it was opened from
    <Modal
      visible={url !== null}
      transparent={swipesBack}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <SwipeBack onBack={onClose} style={styles.screen}>
        {shown && <Pages urls={urls} start={urls.indexOf(shown.url)} />}
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
      </SwipeBack>
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
