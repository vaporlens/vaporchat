import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactElement, useCallback } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import { useCached } from '../cache';
import { SubTabs } from '../components/SubTabs';
import { colors } from '../theme';

// the pill showing all, category ids are numbers
const ALL = 'all';

/**
 * Over the wishlist: the tab's pills, then the user's wishlist categories to show one of, once they
 * made some, and sharing the wishlist's link.
 */
export function WishlistHeader({
  feeds,
  header,
  categoryId,
  onCategory,
  onError,
}: {
  feeds: SteamFeeds;
  header: ReactElement;
  /** null for all */
  categoryId: string | null;
  onCategory: (categoryId: string | null) => void;
  onError: (err: Error) => void;
}) {
  const load = useCallback(() => feeds.getWishlistCategories(), [feeds]);
  // the wishlist shows without them
  const categories = useCached('wishlist-categories', load).data ?? [];
  const share = () =>
    feeds
      .getWishlistUrl(categoryId)
      .then((url) => Share.share({ message: url }))
      .catch(onError);
  return (
    <>
      {header}
      <View style={styles.row}>
        <View style={styles.grow}>
          {categories.length > 0 && (
            <SubTabs
              tabs={[
                { tab: ALL, title: 'All' },
                ...categories.map((category) => ({
                  tab: category.id,
                  title: `${category.name} · ${category.count}`,
                })),
              ]}
              tab={categoryId ?? ALL}
              onChange={(tab) => onCategory(tab === ALL ? null : tab)}
            />
          )}
        </View>
        <Pressable
          onPress={share}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Share wishlist"
          style={({ pressed }) => [styles.share, pressed && styles.pressed]}
        >
          <Ionicons name="share-outline" size={20} color={colors.text} />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  share: { paddingHorizontal: 16, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
});
