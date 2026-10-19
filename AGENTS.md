# AGENTS.md

npm workspaces: `packages/vaporchat` is the Steam client library (CM connection, web sessions, store APIs), `packages/mobile` the Expo app, `packages/web` the browser app.

## Mobile pointers

- Navigation: `screens/stack.ts` (native stack, `usePages()`); the tabs are local state in `screens/Home.tsx`.
- Game page: `screens/GameScreen.tsx`, its sections in `screens/GameSections.tsx`.
- Steam data for screens: `SteamFeeds` in `packages/vaporchat/client/feeds.ts`.
- VaporLens client: `vaporlens.ts`.
- Data loading: `useCached` in `cache.ts` shows last run's value from a per-account file cache, then reloads. Use it for data that may show stale; load per-user state that must be current (wishlist interest, votes) with `useEffect`, like `Actions` in `GameScreen.tsx`.

## Docs

- `docs/features.md`: shipped features and the Steam APIs behind each. `docs/features-pending.md` and `docs/features-wont-do.md` cover the rest.
