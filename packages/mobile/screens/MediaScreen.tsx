import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailHeader } from '../components/DetailHeader';
import { type MediaItem, MediaTile, mediaCount } from '../components/MediaTile';
import { colors } from '../theme';

const COLUMNS = 2;
const GAP = 8;
const PADDING = 16;

/** All of a game's trailers and screenshots, two to a row. */
export function MediaScreen({
  title,
  media,
  onBack,
  onOpenImage,
}: {
  title: string;
  media: MediaItem[];
  onBack: () => void;
  onOpenImage: (url: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = {
    width: (width - 2 * PADDING - (COLUMNS - 1) * GAP) / COLUMNS,
    aspectRatio: 16 / 9,
    borderRadius: 6,
  };
  return (
    <View style={styles.screen}>
      <DetailHeader
        title={title}
        subtitle={mediaCount(media)}
        onBack={onBack}
      />
      <FlatList
        data={media}
        keyExtractor={(item) => item.url}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        renderItem={({ item }) => (
          <MediaTile item={item} style={tile} onOpenImage={onOpenImage} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: PADDING, gap: GAP },
  row: { gap: GAP },
});
