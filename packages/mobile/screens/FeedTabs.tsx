import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { FriendActivity, SteamEvent, StoreItem } from 'vaporchat/protocol';
import { SectionTitle } from '../components/SectionTitle';
import type { Tab } from '../components/TabBar';
import { openLink } from '../links';
import { Feed } from './Feed';
import {
  ActivityRow,
  EventCard,
  EventCarousel,
  StoreItemCard,
} from './FeedCards';
import type { Page } from './PageStack';

type FeedTab = Exclude<Tab, 'chat'>;

interface Props {
  voice: SteamVoice;
  onOpenGame: (item: StoreItem) => void;
  onOpenPage: (page: Page) => void;
  onError: (err: Error) => void;
}

type DealRow =
  | { kind: 'events'; events: SteamEvent[] }
  | { kind: 'title' }
  | { kind: 'item'; item: StoreItem };

function dealKey(row: DealRow) {
  return row.kind === 'item' ? row.item.url : row.kind;
}

function Deals({ voice, onOpenGame, onOpenPage, onError }: Props) {
  const load = useCallback(async () => {
    const { events, specials } = await voice.connection.feeds.getDeals();
    const rows: DealRow[] = [
      ...(events.length > 0 ? [{ kind: 'events', events } as const] : []),
      { kind: 'title' },
      ...specials.map((item) => ({ kind: 'item', item }) as const),
    ];
    return { items: rows, next: null };
  }, [voice]);
  return (
    <Feed
      load={load}
      keyOf={dealKey}
      renderItem={(row) =>
        row.kind === 'events' ? (
          <EventCarousel
            events={row.events}
            onOpen={(event) => onOpenPage({ kind: 'sale', event })}
          />
        ) : row.kind === 'title' ? (
          <SectionTitle title="Special offers" style={styles.title} />
        ) : (
          <StoreItemCard
            item={row.item}
            show="discountEnds"
            onPress={() => onOpenGame(row.item)}
          />
        )
      }
      empty="No deals right now."
      onError={onError}
    />
  );
}

function NewReleases({ voice, onOpenGame, onError }: Props) {
  const load = useCallback(
    async () => ({
      items: await voice.connection.feeds.getNewReleases(),
      next: null,
    }),
    [voice],
  );
  return (
    <Feed
      load={load}
      keyOf={(item) => item.url}
      renderItem={(item) => (
        <StoreItemCard
          item={item}
          show="released"
          onPress={() => onOpenGame(item)}
        />
      )}
      empty="No new releases."
      onError={onError}
    />
  );
}

function News({ voice, onOpenPage, onError }: Props) {
  const load = useCallback(
    (before: number | null) => voice.connection.feeds.getNews(before),
    [voice],
  );
  return (
    <Feed
      load={load}
      keyOf={(event) => event.id}
      renderItem={(event) => (
        <EventCard
          event={event}
          onPress={() => onOpenPage({ kind: 'article', event })}
        />
      )}
      empty="No news of your games yet."
      onError={onError}
    />
  );
}

function Activity({ voice, onOpenGame, onError }: Props) {
  // names and avatars of people who aren't friends arrive later
  const [friends, setFriends] = useState(voice.connection.friends);
  useEffect(() => voice.connection.on('friendsChanged', setFriends), [voice]);
  const load = useCallback(
    (before: number | null) =>
      voice.connection.feeds.getFriendsActivity(before),
    [voice],
  );
  return (
    <Feed<FriendActivity>
      load={load}
      keyOf={(activity) => activity.id}
      renderItem={(activity) => (
        <ActivityRow
          activity={activity}
          user={(steamid) => voice.connection.user(steamid)}
          onPress={() => openLink(activity.url)}
          onOpenGame={onOpenGame}
        />
      )}
      extraData={friends}
      empty="Your friends haven't done anything lately."
      onError={onError}
    />
  );
}

const SCREENS: Record<FeedTab, (props: Props) => ReactElement> = {
  deals: Deals,
  releases: NewReleases,
  news: News,
  activity: Activity,
};

/**
 * The Steam feeds of the tabs. Each loads when first opened and stays (hidden) after, so
 * coming back keeps its scroll position. Memoized, Home renders again on every friend's
 * status change.
 */
export const FeedTabs = memo(function FeedTabs({
  tab,
  ...props
}: Props & { tab: Tab }) {
  const [opened, setOpened] = useState<FeedTab[]>([]);
  if (tab !== 'chat' && !opened.includes(tab)) setOpened([...opened, tab]);
  return opened.map((name) => {
    const Screen = SCREENS[name];
    return (
      <View key={name} style={[styles.grow, name !== tab && styles.hidden]}>
        <Screen {...props} />
      </View>
    );
  });
});

const styles = StyleSheet.create({
  // like the other section titles of the feeds
  title: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  grow: { flex: 1 },
  hidden: { display: 'none' },
});
