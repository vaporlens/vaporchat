import {
  type ComponentType,
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type { FriendActivity, SteamEvent, StoreItem } from 'vaporchat/protocol';
import { KeepOpened } from '../components/KeepOpened';
import { SubTabs } from '../components/SubTabs';
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

interface StoreList {
  tab: string;
  title: string;
  empty: string;
  get: (feeds: SteamFeeds) => Promise<StoreItem[]>;
}

const STORE_LISTS: StoreList[] = [
  {
    tab: 'discounted',
    title: 'Discounted',
    empty: 'No deals right now.',
    get: (feeds) => feeds.getSpecials(),
  },
  {
    tab: 'topSellers',
    title: 'Top sellers',
    empty: 'No top sellers right now.',
    get: (feeds) => feeds.getTopSellers(),
  },
];

const RELEASE_LISTS: StoreList[] = [
  {
    tab: 'new',
    title: 'Popular new',
    empty: 'No new releases.',
    get: (feeds) => feeds.getNewReleases(),
  },
  {
    tab: 'upcoming',
    title: 'Popular upcoming',
    empty: 'No upcoming releases.',
    get: (feeds) => feeds.getUpcoming(),
  },
];

/** A tab's lists, switched between by the pills over them (under `top`). */
function Lists<L extends { tab: string; title: string }>({
  lists,
  top,
  render,
}: {
  lists: L[];
  top?: ReactNode;
  render: (list: L, header: ReactElement) => ReactElement;
}) {
  const [tab, setTab] = useState(lists[0].tab);
  const header = (
    <>
      {top}
      <SubTabs tabs={lists} tab={tab} onChange={setTab} />
    </>
  );
  return (
    <KeepOpened
      tab={tab}
      render={(name) =>
        render(lists.find((list) => list.tab === name)!, header)
      }
    />
  );
}

function StoreItems({
  voice,
  list: { get, empty },
  show,
  header,
  onOpenGame,
  onError,
}: Props & {
  list: StoreList;
  show: 'released' | 'discountEnds';
  header: ReactElement;
}) {
  const load = useCallback(
    async () => ({ items: await get(voice.connection.feeds), next: null }),
    [voice, get],
  );
  return (
    <Feed
      load={load}
      keyOf={(item) => item.url}
      renderItem={(item) => (
        <StoreItemCard
          item={item}
          show={show}
          onPress={() => onOpenGame(item)}
        />
      )}
      header={header}
      empty={empty}
      onError={onError}
    />
  );
}

const Store = memo(function Store(props: Props) {
  const { voice, onOpenPage, onError } = props;
  // loaded once, sale events run for days
  const [events, setEvents] = useState<SteamEvent[]>([]);
  useEffect(() => {
    voice.connection.feeds.getSaleEvents().then(setEvents, onError);
  }, [voice, onError]);
  return (
    <Lists
      lists={STORE_LISTS}
      top={
        events.length > 0 && (
          <EventCarousel
            events={events}
            onOpen={(event) => onOpenPage({ kind: 'sale', event })}
          />
        )
      }
      render={(list, header) => (
        <StoreItems
          {...props}
          list={list}
          show="discountEnds"
          header={header}
        />
      )}
    />
  );
});

const Releases = memo(function Releases(props: Props) {
  return (
    <Lists
      lists={RELEASE_LISTS}
      render={(list, header) => (
        <StoreItems {...props} list={list} show="released" header={header} />
      )}
    />
  );
});

function News({
  voice,
  onOpenPage,
  onError,
  header,
}: Props & { header: ReactElement }) {
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
      header={header}
      empty="No news of your games yet."
      onError={onError}
    />
  );
}

function Activity({
  voice,
  onOpenGame,
  onError,
  header,
}: Props & { header: ReactElement }) {
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
      header={header}
      extraData={friends}
      empty="Your friends haven't done anything lately."
      onError={onError}
    />
  );
}

const FEED_LISTS = [
  { tab: 'news', title: 'News', Screen: News },
  { tab: 'activity', title: 'Activity', Screen: Activity },
];

/** News of the user's games and what their friends did. */
const NewsAndActivity = memo(function NewsAndActivity(props: Props) {
  return (
    <Lists
      lists={FEED_LISTS}
      render={({ Screen }, header) => <Screen {...props} header={header} />}
    />
  );
});

const SCREENS: Record<FeedTab, ComponentType<Props>> = {
  store: Store,
  releases: Releases,
  feed: NewsAndActivity,
};

/**
 * The Steam feeds of the tabs, each with its lists to switch between. Memoized, Home renders
 * again on every friend's status change.
 */
export const FeedTabs = memo(function FeedTabs({
  tab,
  ...props
}: Props & { tab: Tab }) {
  return (
    <KeepOpened
      tab={tab === 'chat' ? null : tab}
      render={(name) => {
        const Screen = SCREENS[name];
        return <Screen {...props} />;
      }}
    />
  );
});
