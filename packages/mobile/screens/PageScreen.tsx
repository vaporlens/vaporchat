import { memo, useState } from 'react';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SteamEvent, StoreBrowse, StoreItem } from 'vaporchat/protocol';
import { ImageViewer } from '../components/ImageViewer';
import { ArticleScreen } from './ArticleScreen';
import { BrowseScreen } from './BrowseScreen';
import { BundleScreen } from './BundleScreen';
import { GameScreen } from './GameScreen';
import { SaleScreen } from './SaleScreen';

/** A screen pushed over the tabs. */
export type Page =
  | { kind: 'game'; item: StoreItem & { appid: number } }
  | { kind: 'bundle'; item: StoreItem }
  | { kind: 'article'; event: SteamEvent }
  | { kind: 'sale'; event: SteamEvent }
  | { kind: 'browse'; browse: StoreBrowse };

/** A pushed screen. Memoized, Home renders again on every friend's status change. */
export const PageScreen = memo(function PageScreen({
  feeds,
  page,
  onBack,
  onOpenGame,
  onOpenPage,
  onError,
}: {
  feeds: SteamFeeds;
  page: Page;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
  onOpenPage: (page: Page) => void;
  onError: (err: Error) => void;
}) {
  const [viewing, setViewing] = useState<{
    url: string;
    gallery?: string[];
  } | null>(null);
  const openImage = (url: string, gallery?: string[]) =>
    setViewing({ url, gallery });
  return (
    <>
      {page.kind === 'game' ? (
        <GameScreen
          feeds={feeds}
          item={page.item}
          onBack={onBack}
          onOpenImage={openImage}
          onOpenGame={onOpenGame}
          onOpenPage={onOpenPage}
          onError={onError}
        />
      ) : page.kind === 'bundle' ? (
        <BundleScreen
          feeds={feeds}
          item={page.item}
          onBack={onBack}
          onOpenGame={onOpenGame}
        />
      ) : page.kind === 'browse' ? (
        <BrowseScreen
          feeds={feeds}
          browse={page.browse}
          onBack={onBack}
          onOpenGame={onOpenGame}
          onError={onError}
        />
      ) : page.kind === 'article' ? (
        <ArticleScreen
          feeds={feeds}
          event={page.event}
          onBack={onBack}
          onOpenGame={onOpenGame}
          onOpenImage={openImage}
          onError={onError}
        />
      ) : (
        <SaleScreen
          feeds={feeds}
          event={page.event}
          onBack={onBack}
          onOpenGame={onOpenGame}
          onOpenImage={openImage}
        />
      )}
      <ImageViewer
        url={viewing?.url ?? null}
        gallery={viewing?.gallery}
        onClose={() => setViewing(null)}
      />
    </>
  );
});
