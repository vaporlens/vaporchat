import { type ReactElement, useCallback } from 'react';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import { useCached } from '../cache';
import { SubTabs } from '../components/SubTabs';

// the pill showing all, category ids are numbers
const ALL = 'all';

/**
 * Over the wishlist: the tab's pills, then the user's wishlist categories to show one of, once they
 * made some.
 */
export function WishlistHeader({
  feeds,
  header,
  categoryId,
  onCategory,
}: {
  feeds: SteamFeeds;
  header: ReactElement;
  /** null for all */
  categoryId: string | null;
  onCategory: (categoryId: string | null) => void;
}) {
  const load = useCallback(() => feeds.getWishlistCategories(), [feeds]);
  // the wishlist shows without them
  const categories = useCached('wishlist-categories', load).data ?? [];
  return (
    <>
      {header}
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
    </>
  );
}
