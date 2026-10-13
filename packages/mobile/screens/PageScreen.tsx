import { memo, useState } from 'react';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { SteamEvent, StoreItem } from 'vaporchat/protocol';
import { ImageViewer } from '../components/ImageViewer';
import type { MediaItem } from '../components/MediaTile';
import { ArticleScreen } from './ArticleScreen';
import { BundleScreen } from './BundleScreen';
import { GameScreen } from './GameScreen';
import { MediaScreen } from './MediaScreen';
import { SaleScreen } from './SaleScreen';

/** A screen pushed over the tabs. */
export type Page =
  | { kind: 'game'; item: StoreItem & { appid: number } }
  | { kind: 'bundle'; item: StoreItem }
  | { kind: 'article'; event: SteamEvent }
  | { kind: 'sale'; event: SteamEvent }
  | { kind: 'media'; title: string; media: MediaItem[] };

/** A pushed screen. Memoized, Home renders again on every friend's status change. */
export const PageScreen = memo(function PageScreen({
  voice,
  page,
  onBack,
  onOpenGame,
  onOpenPage,
}: {
  voice: SteamVoice;
  page: Page;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
  onOpenPage: (page: Page) => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <>
      {page.kind === 'game' ? (
        <GameScreen
          voice={voice}
          item={page.item}
          onBack={onBack}
          onOpenImage={setViewing}
          onOpenMedia={(media) =>
            onOpenPage({ kind: 'media', title: page.item.name, media })
          }
        />
      ) : page.kind === 'media' ? (
        <MediaScreen
          title={page.title}
          media={page.media}
          onBack={onBack}
          onOpenImage={setViewing}
        />
      ) : page.kind === 'bundle' ? (
        <BundleScreen
          voice={voice}
          item={page.item}
          onBack={onBack}
          onOpenGame={onOpenGame}
        />
      ) : page.kind === 'article' ? (
        <ArticleScreen
          event={page.event}
          onBack={onBack}
          onOpenImage={setViewing}
        />
      ) : (
        <SaleScreen
          voice={voice}
          event={page.event}
          onBack={onBack}
          onOpenGame={onOpenGame}
          onOpenImage={setViewing}
        />
      )}
      <ImageViewer url={viewing} onClose={() => setViewing(null)} />
    </>
  );
});
