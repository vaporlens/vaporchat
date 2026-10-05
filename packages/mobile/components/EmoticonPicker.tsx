// react-native's Image shows only the first frame of animated stickers
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  EmoticonPart,
  OwnedEmoticons,
  StickerPart,
} from 'vaporchat/protocol';
import { colors } from '../theme';

const HEIGHT = 260;
const TABS = {
  emoticons: {
    title: 'Emoticons',
    columns: 7,
    size: 32,
    empty: 'No emoticons yet.',
  },
  stickers: {
    title: 'Stickers',
    columns: 4,
    size: 72,
    empty: 'No stickers yet. They come from the Steam Points Shop.',
  },
};
type Tab = keyof typeof TABS;

/** The account's emoticons and stickers, in place of the keyboard. */
export function EmoticonPicker({
  voice,
  bottomInset,
  onEmoticon,
  onSticker,
  onError,
}: {
  voice: SteamVoice;
  bottomInset: number;
  onEmoticon: (emoticon: EmoticonPart) => void;
  onSticker: (sticker: StickerPart) => void;
  onError: (err: Error) => void;
}) {
  const [tab, setTab] = useState<Tab>('emoticons');
  // null while loading, the connection fetches them once
  const [owned, setOwned] = useState<OwnedEmoticons | null>(null);

  useEffect(() => {
    let current = true;
    voice.connection.getEmoticons().then(
      (list) => current && setOwned(list),
      (err: Error) =>
        current &&
        onError(new Error(`Could not load emoticons: ${err.message}`)),
    );
    return () => {
      current = false;
    };
  }, [voice, onError]);
  const { columns, size, empty } = TABS[tab];
  const items: (EmoticonPart | StickerPart)[] = owned?.[tab] ?? [];
  return (
    <View style={[styles.panel, { height: HEIGHT + bottomInset }]}>
      <View style={styles.tabs}>
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {TABS[key].title}
            </Text>
          </Pressable>
        ))}
      </View>
      {owned === null ? (
        <ActivityIndicator color={colors.muted} style={styles.message} />
      ) : (
        <FlatList
          // the column count can't change on a mounted list
          key={tab}
          data={items}
          numColumns={columns}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ padding: 8, paddingBottom: bottomInset }}
          ListEmptyComponent={
            <Text style={[styles.message, styles.messageText]}>{empty}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                item.kind === 'emoticon' ? onEmoticon(item) : onSticker(item)
              }
              accessibilityLabel={item.name}
              style={({ pressed }) => [
                styles.cell,
                { width: `${100 / columns}%` },
                pressed && styles.pressed,
              ]}
            >
              <Image
                source={{ uri: item.url }}
                style={{ width: size, height: size }}
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.bar },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderColor: 'transparent',
  },
  tabActive: { borderColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.bright },
  cell: { alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  pressed: { backgroundColor: colors.surfaceRaised },
  message: { marginTop: 32 },
  messageText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
});
