import {
  type ComponentType,
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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
import { SignInPrompt } from '../components/SignInPrompt';
import { SubTabs } from '../components/SubTabs';
import type { Tab } from '../components/TabBar';
import { openLink } from '../links';
import { Feed, type Search } from './Feed';
import { ActivityRow, EventCard, StoreItemCard } from './FeedCards';
import type { Page } from './PageScreen';

type FeedTab = Exclude<Tab, 'chat'>;

type Props = {
  feeds: SteamFeeds;
  onOpenGame: (item: StoreItem) => void;
  onOpenPage: (page: Page) => void;
  onError: (err: Error) => void;
} & (
  | { voice: SteamVoice; onSignIn?: undefined }
  /** signed out, the user's own lists offer to sign in instead */
  | { voice: null; onSignIn: () => void }
);

/** A list of a tab and where it loads from, a page at a time (`next` of the last one). */
interface List<T> {
  tab: string;
  title: string;
  empty: string;
  load: (feeds: SteamFeeds, next: number | null) => Promise<FeedPage<T>>;
  /** the user's own: why to sign in, shown in its place signed out */
  signInMessage?: string;
  /** the user's own: its search bar's text, the bar filters it instead of searching the store */
  filterPlaceholder?: string;
}

// the feeds' `keyOf`, stable so they don't load again on every render
const storeItemKey = (item: StoreItem) => item.url;
const eventKey = (event: SteamEvent) => event.id;
const activityKey = (activity: FriendActivity) => activity.id;
// what the user's own lists filter by
const storeItemName = (item: StoreItem) => item.name;

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
    signInMessage: 'Sign in with Steam to see your wishlist.',
    filterPlaceholder: 'Search your wishlist',
  },
  {
    tab: 'library',
    title: 'My games',
    empty: 'You have no games yet.',
    load: whole((feeds) => feeds.getLibrary()),
    signInMessage: 'Sign in with Steam to see your games.',
    filterPlaceholder: 'Search your games',
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
    signInMessage: 'Sign in with Steam to see the releases picked for you.',
  },
];

/**
 * A tab's lists, switched between by the pills over them. With `onSignIn` (signed out), the
 * user's own ask to sign in instead.
 */
function Lists<
  L extends { tab: string; title: string; signInMessage?: string },
>({
  lists,
  onSignIn,
  render,
}: {
  lists: L[];
  onSignIn: (() => void) | undefined;
  render: (list: L, header: ReactElement) => ReactNode;
}) {
  const [tab, setTab] = useState(lists[0].tab);
  const header = <SubTabs tabs={lists} tab={tab} onChange={setTab} />;
  return (
    <KeepOpened
      tab={tab}
      render={(name) => {
        const list = lists.find((list) => list.tab === name)!;
        return onSignIn && list.signInMessage ? (
          <>
            {header}
            <SignInPrompt message={list.signInMessage} onSignIn={onSignIn} />
          </>
        ) : (
          render(list, header)
        );
      }}
    />
  );
}

function StoreItems({
  feeds,
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
    (next: number | null) => list.load(feeds, next),
    [feeds, list],
  );
  const renderItem = useCallback(
    (item: StoreItem) => (
      <StoreItemCard item={item} show={show} onPress={onOpenGame} />
    ),
    [show, onOpenGame],
  );
  const search = useMemo<Search<StoreItem>>(
    () =>
      list.filterPlaceholder
        ? { placeholder: list.filterPlaceholder, textOf: storeItemName }
        : {
            placeholder: 'Search the store',
            find: (query, next) => feeds.searchGames(query, next),
          },
    [feeds, list],
  );
  return (
    <Feed
      cacheKey={`feed-${list.tab}`}
      load={load}
      keyOf={storeItemKey}
      search={search}
      columns={2}
      renderItem={renderItem}
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
      onSignIn={props.onSignIn}
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
      onSignIn={props.onSignIn}
      render={(list, header) => (
        <StoreItems {...props} list={list} show="released" header={header} />
      )}
    />
  );
});

/** News posts or sale events, opening as an article or a sale page. */
function Events({
  feeds,
  list,
  header,
  onOpenPage,
  onError,
}: Props & {
  list: List<SteamEvent> & { page: 'article' | 'sale' };
  header: ReactElement;
}) {
  const load = useCallback(
    (next: number | null) => list.load(feeds, next),
    [feeds, list],
  );
  const openEvent = useCallback(
    (event: SteamEvent) => onOpenPage({ kind: list.page, event }),
    [list.page, onOpenPage],
  );
  const renderItem = useCallback(
    (event: SteamEvent) => <EventCard event={event} onPress={openEvent} />,
    [openEvent],
  );
  return (
    <Feed
      cacheKey={`feed-${list.tab}`}
      load={load}
      keyOf={eventKey}
      renderItem={renderItem}
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
}: Props & { voice: SteamVoice; header: ReactElement }) {
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
    empty: 'No news yet.',
    load: (feeds: SteamFeeds, before: number | null) => feeds.getNews(before),
    page: 'article' as const,
  },
  {
    tab: 'activity',
    title: 'Activity',
    signInMessage: 'Sign in with Steam to see what your friends did lately.',
  },
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
  const { voice } = props;
  return (
    <Lists
      lists={FEED_LISTS}
      onSignIn={props.onSignIn}
      render={(list, header) =>
        list.page ? (
          <Events {...props} list={list} header={header} />
        ) : (
          voice && <Activity {...props} voice={voice} header={header} />
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
