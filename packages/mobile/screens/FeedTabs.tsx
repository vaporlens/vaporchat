import {
  type ComponentType,
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SteamVoice } from 'vaporchat/client/steamVoice';
import type {
  FeedPage,
  FriendActivity,
  SteamEvent,
  StoreItem,
} from 'vaporchat/protocol';
import { KeepOpened } from '../components/KeepOpened';
import { SubTabs } from '../components/SubTabs';
import type { Tab } from '../components/TabBar';
import { openLink } from '../links';
import { Feed } from './Feed';
import { ActivityRow, EventCard, StoreItemCard } from './FeedCards';
import type { Page } from './PageScreen';

type FeedTab = Exclude<Tab, 'chat'>;

interface Props {
  voice: SteamVoice;
  onOpenGame: (item: StoreItem) => void;
  onOpenPage: (page: Page) => void;
  onError: (err: Error) => void;
}

/** A list of a tab and where it loads from, a page at a time (`next` of the last one). */
interface List<T> {
  tab: string;
  title: string;
  empty: string;
  load: (feeds: SteamFeeds, next: number | null) => Promise<FeedPage<T>>;
}

// the feeds' `keyOf`, stable so they don't load again on every render
const storeItemKey = (item: StoreItem) => item.url;
const eventKey = (event: SteamEvent) => event.id;
const activityKey = (activity: FriendActivity) => activity.id;

/** Loads a list Steam gives all at once. */
function whole<T>(get: (feeds: SteamFeeds) => Promise<T[]>) {
  return async (feeds: SteamFeeds) => ({ items: await get(feeds), next: null });
}

const STORE_LISTS: List<StoreItem>[] = [
  {
    tab: 'discounted',
    title: 'Discounted',
    empty: 'No deals right now.',
    load: (feeds, next) => feeds.getSpecials(next),
  },
  {
    tab: 'topSellers',
    title: 'Top sellers',
    empty: 'No top sellers right now.',
    load: (feeds, next) => feeds.getTopSellers(next),
  },
  {
    tab: 'wishlist',
    title: 'Wishlist',
    empty: 'Your wishlist is empty.',
    load: (feeds, next) => feeds.getWishlist(next),
  },
];

const RELEASE_LISTS: List<StoreItem>[] = [
  {
    tab: 'new',
    title: 'Popular new',
    empty: 'No new releases.',
    load: (feeds, next) => feeds.getNewReleases(next),
  },
  {
    tab: 'upcoming',
    title: 'Popular upcoming',
    empty: 'No upcoming releases.',
    load: (feeds, next) => feeds.getUpcoming(next),
  },
  {
    tab: 'calendar',
    title: 'For you',
    empty: 'Nothing for you releasing in the next few days.',
    load: (feeds, next) => feeds.getPersonalCalendar(next),
  },
];

/** A tab's lists, switched between by the pills over them. */
function Lists<L extends { tab: string; title: string }>({
  lists,
  render,
}: {
  lists: L[];
  render: (list: L, header: ReactElement) => ReactElement;
}) {
  const [tab, setTab] = useState(lists[0].tab);
  const header = <SubTabs tabs={lists} tab={tab} onChange={setTab} />;
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
  list,
  show,
  header,
  onOpenGame,
  onError,
}: Props & {
  list: List<StoreItem>;
  show: 'released' | 'discountEnds';
  header: ReactElement;
}) {
  const load = useCallback(
    (next: number | null) => list.load(voice.connection.feeds, next),
    [voice, list],
  );
  return (
    <Feed
      cacheKey={`feed-${list.tab}`}
      load={load}
      keyOf={storeItemKey}
      columns={2}
      renderItem={(item) => (
        <StoreItemCard
          item={item}
          show={show}
          onPress={() => onOpenGame(item)}
        />
      )}
      header={header}
      empty={list.empty}
      onError={onError}
    />
  );
}

const Store = memo(function Store(props: Props) {
  return (
    <Lists
      lists={STORE_LISTS}
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

/** News posts or sale events, opening as an article or a sale page. */
function Events({
  voice,
  list,
  header,
  onOpenPage,
  onError,
}: Props & {
  list: List<SteamEvent> & { page: 'article' | 'sale' };
  header: ReactElement;
}) {
  const load = useCallback(
    (next: number | null) => list.load(voice.connection.feeds, next),
    [voice, list],
  );
  return (
    <Feed
      cacheKey={`feed-${list.tab}`}
      load={load}
      keyOf={eventKey}
      renderItem={(event) => (
        <EventCard
          event={event}
          onPress={() => onOpenPage({ kind: list.page, event })}
        />
      )}
      header={header}
      empty={list.empty}
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
      cacheKey="feed-activity"
      load={load}
      keyOf={activityKey}
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
  {
    tab: 'news',
    title: 'News',
    empty: 'No news of your games yet.',
    load: (feeds: SteamFeeds, before: number | null) => feeds.getNews(before),
    page: 'article' as const,
  },
  { tab: 'activity', title: 'Activity' },
  {
    tab: 'events',
    title: 'Events',
    empty: 'No sale events right now.',
    load: whole((feeds) => feeds.getSaleEvents()),
    page: 'sale' as const,
  },
];

/** News of the user's games, what their friends did and the store's sale events. */
const SteamFeed = memo(function SteamFeed(props: Props) {
  return (
    <Lists
      lists={FEED_LISTS}
      render={(list, header) =>
        list.page ? (
          <Events {...props} list={list} header={header} />
        ) : (
          <Activity {...props} header={header} />
        )
      }
    />
  );
});

const SCREENS: Record<FeedTab, ComponentType<Props>> = {
  store: Store,
  releases: Releases,
  feed: SteamFeed,
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
