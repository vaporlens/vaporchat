import { useCallback } from 'react';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { SteamEvent } from 'vaporchat/protocol';
import { EventCard } from './FeedCards';
import { eventKey } from './FeedTabs';
import { PagedList } from './PagedList';

/** A game's news, updates and events, newest first, the next ones loading once scrolled to the end. */
export function GameNews({
  feeds,
  appid,
  onOpenEvent,
  onError,
}: {
  feeds: SteamFeeds;
  appid: number;
  onOpenEvent: (event: SteamEvent) => void;
  /** a later page failing, scrolling to the end again retries */
  onError: (err: Error) => void;
}) {
  const load = useCallback(
    (offset: number | null) => feeds.getGameNews(appid, offset),
    [feeds, appid],
  );
  return (
    <PagedList
      load={load}
      keyOf={eventKey}
      cacheKey={`news-${appid}`}
      empty="No news yet"
      renderItem={(event) => <EventCard event={event} onPress={onOpenEvent} />}
      onError={onError}
    />
  );
}
