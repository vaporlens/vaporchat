import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { DetailHeader } from './DetailHeader';

/** A pushed screen that scrolls: the header bar, a picture as wide as the screen, its content. */
export function DetailPage({
  title,
  subtitle,
  steamUrl,
  onBack,
  imageUrl,
  imageRatio,
  children,
}: {
  title: string;
  subtitle?: string;
  steamUrl: string;
  onBack: () => void;
  imageUrl: string | null;
  /** width / height */
  imageRatio: number;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <DetailHeader
        title={title}
        subtitle={subtitle}
        steamUrl={steamUrl}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {imageUrl && (
          <Image
            source={imageUrl}
            style={[styles.image, { aspectRatio: imageRatio }]}
            contentFit="cover"
          />
        )}
        {children}
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
