import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { SteamEvent, StoreItem } from 'vaporchat/protocol';
import { ImageViewer } from '../components/ImageViewer';
import { ArticleScreen } from './ArticleScreen';
import { BundleScreen } from './BundleScreen';
import { GameScreen } from './GameScreen';
import { SaleScreen } from './SaleScreen';

/** A screen pushed over the tabs. */
export type Page =
  | { kind: 'game'; item: StoreItem & { appid: number } }
  | { kind: 'bundle'; item: StoreItem }
  | { kind: 'article'; event: SteamEvent }
  | { kind: 'sale'; event: SteamEvent };

/**
 * The pushed screens, the last one shown. The ones below stay (hidden), so going back keeps
 * their scroll position. Memoized, Home renders again on every friend's status change.
 */
export const PageStack = memo(function PageStack({
  voice,
  pages,
  onBack,
  onOpenGame,
}: {
  voice: SteamVoice;
  pages: Page[];
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
}) {
  // one viewer for all of them, only the top one is visible
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <>
      {pages.map((page, index) => (
        <View
          // a stack only changes at its top, the position is a stable key
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          style={[styles.page, index < pages.length - 1 && styles.hidden]}
        >
          {page.kind === 'game' ? (
            <GameScreen
              voice={voice}
              item={page.item}
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
        </View>
      ))}
      <ImageViewer url={viewing} onClose={() => setViewing(null)} />
    </>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1 },
  hidden: { display: 'none' },
});
