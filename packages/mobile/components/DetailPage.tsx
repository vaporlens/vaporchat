import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, imageFadeMs } from '../theme';
import { DetailHeader, useScrolledPast } from './DetailHeader';
import { useScrollWatch } from './onScreen';

/** A pushed screen that scrolls: the header bar, a picture as wide as the screen, its content. */
export function DetailPage({
  title,
  subtitle,
  steamUrl,
  onBack,
  imageUrl,
  imageRatio,
  titleInContent = false,
  children,
}: {
  title: string;
  subtitle?: string;
  steamUrl: string;
  onBack: () => void;
  imageUrl: string | null;
  /** width / height */
  imageRatio: number;
  /** the content starts with the title under the picture, the header shows it past that */
  titleInContent?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useScrollWatch();
  const pastImage = useScrolledPast(imageUrl ? width / imageRatio : 0);
  return (
    <View style={styles.screen}>
      <DetailHeader
        title={title}
        subtitle={subtitle}
        steamUrl={steamUrl}
        titleShown={!titleInContent || pastImage.past}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        onScroll={(event) => {
          scroll.onScroll();
          pastImage.onScroll(event);
        }}
        scrollEventThrottle={100}
      >
        <scroll.Provider value={scroll.listeners}>
          {imageUrl && (
            <Image
              source={imageUrl}
              transition={imageFadeMs}
              style={[styles.image, { aspectRatio: imageRatio }]}
              contentFit="cover"
            />
          )}
          {children}
        </scroll.Provider>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  // edge to edge inside the padded page
  image: { marginHorizontal: -16, marginTop: -16 },
});
