import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  SteamNotice,
  SteamNoticeKind,
  StoreItem,
} from 'vaporchat/protocol';
import { DetailHeader } from '../components/DetailHeader';
import type { IconName } from '../components/RoundButton';
import { timeAgo } from '../format';
import { openLink } from '../links';
import { colors } from '../theme';

const KINDS: Record<SteamNoticeKind, { icon: IconName; title: string }> = {
  gift: { icon: 'gift-outline', title: 'You received a gift' },
  comment: { icon: 'chatbox-outline', title: 'New comment' },
  item: { icon: 'cube-outline', title: 'New item in your inventory' },
  friendInvite: { icon: 'person-add-outline', title: 'New friend invite' },
  sale: { icon: 'pricetag-outline', title: 'A sale has started' },
  wishlist: { icon: 'heart-outline', title: 'On sale from your wishlist' },
  tradeOffer: { icon: 'swap-horizontal-outline', title: 'New trade offer' },
  general: { icon: 'megaphone-outline', title: 'Message from Steam' },
  helpRequest: { icon: 'help-buoy-outline', title: 'Support ticket update' },
  turn: { icon: 'game-controller-outline', title: "It's your turn" },
  moderator: { icon: 'shield-outline', title: 'Message from a moderator' },
  family: { icon: 'people-outline', title: 'Steam Family request' },
  playtest: { icon: 'flask-outline', title: 'Playtest invite' },
  other: { icon: 'notifications-outline', title: 'Steam notification' },
};

function noticeTitle(notice: SteamNotice, game: StoreItem | undefined) {
  if (!game) return KINDS[notice.kind].title;
  if (notice.kind === 'wishlist') return `${game.name} is on sale`;
  if (notice.kind === 'playtest') return `Playtest invite: ${game.name}`;
  return KINDS[notice.kind].title;
}

/** The account's Steam notifications, kept current. */
export function useSteamNotices(voice: SteamVoice) {
  const { notices } = voice.connection;
  const [current, setCurrent] = useState(notices.current);

  useEffect(() => {
    setCurrent(notices.current);
    return notices.on('changed', setCurrent);
  }, [notices]);

  return current;
}

/**
 * Steam's notifications, newest first: wishlist sales, gifts, comments and the like. Opening it
 * marks them read, the ones unread until then stay marked while it shows.
 */
export function NoticesScreen({
  voice,
  onBack,
  onOpenGame,
  onError,
}: {
  voice: SteamVoice;
  onBack: () => void;
  onOpenGame: (item: StoreItem) => void;
  onError: (err: Error) => void;
}) {
  const insets = useSafeAreaInsets();
  const notices = useSteamNotices(voice);
  const [unseen] = useState(
    () => new Set(notices.filter((n) => !n.read).map((n) => n.id)),
  );
  const [games, setGames] = useState(new Map<number, StoreItem>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: new ones are read while it shows
  useEffect(() => {
    voice.connection.notices.markAllRead();
  }, [voice, notices]);

  // the games they're about, by name
  const appids = [
    ...new Set(notices.flatMap((n) => (n.appid === null ? [] : [n.appid]))),
  ];
  const appidsKey = appids.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `appidsKey` stands for `appids`
  useEffect(() => {
    if (appids.length === 0) return;
    voice.connection.feeds
      .getStoreItems(appids)
      .then((items) =>
        setGames(
          new Map(
            items.flatMap((item) =>
              item.appid === null ? [] : [[item.appid, item] as const],
            ),
          ),
        ),
      )
      .catch(onError);
  }, [voice, appidsKey, onError]);

  function open(notice: SteamNotice) {
    const game = notice.appid === null ? undefined : games.get(notice.appid);
    if (game) onOpenGame(game);
    else if (notice.url) openLink(notice.url);
  }

  return (
    <View style={styles.screen}>
      <DetailHeader title="Notifications" onBack={onBack} />
      <FlatList
        data={notices}
        keyExtractor={(notice) => notice.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No notifications from Steam.</Text>
        }
        renderItem={({ item: notice }) => {
          const game =
            notice.appid === null ? undefined : games.get(notice.appid);
          const fresh = !notice.read || unseen.has(notice.id);
          return (
            <Pressable
              onPress={() => open(notice)}
              disabled={!game && !notice.url}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Ionicons
                name={KINDS[notice.kind].icon}
                size={24}
                color={fresh ? colors.accent : colors.muted}
              />
              <View style={styles.grow}>
                <Text style={styles.title} numberOfLines={2}>
                  {noticeTitle(notice, game)}
                </Text>
                <Text style={styles.time}>{timeAgo(notice.time)}</Text>
              </View>
              {fresh && <View style={styles.dot} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  title: { color: colors.bright, fontSize: 15 },
  time: { color: colors.muted, fontSize: 13, marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  empty: { color: colors.muted, fontSize: 14, padding: 16 },
});
