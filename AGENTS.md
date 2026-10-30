# AGENTS.md

npm workspaces: `packages/vaporchat` is the Steam client library (CM connection, web sessions, store APIs), `packages/mobile` the Expo app, `packages/web` a browser debug harness.

## Architecture

- The library runs unchanged in React Native, browsers and Node/Bun. Write it against web APIs every platform has (`Uint8Array`/`DataView`, `fetch`, `FormData`, `WebSocket`, `atob`, `crypto.getRandomValues`); Node's `Buffer`, `fs` and `crypto` module break it on the phone.
- The app talks to Steam directly, with no server of ours between the app and Steam. What browsers can't reach without a proxy is under Platforms in `packages/vaporchat/README.md`; `packages/web` proxies only the server list and stays debug-only. Ask the user before a change that adds a server to the app path or narrows the library to one platform.

## Mobile pointers

- Navigation: `screens/stack.ts` (native stack, `usePages()`); the tabs are local state in `screens/Home.tsx`.
- Game page: `screens/GameScreen.tsx`, its sections in `screens/GameSections.tsx`.
- Steam data for screens: `SteamFeeds` in `packages/vaporchat/client/feeds.ts`.
- VaporLens client: `vaporlens.ts`.
- Data loading: `useCached` in `cache.ts` shows last run's value from a per-account file cache, then reloads. Use it for data that may show stale; load per-user state that must be current (wishlist interest, votes) with `useEffect`, like `Actions` in `GameScreen.tsx`.

## Live testing

- `packages/web/scripts/liveVoice.ts` drives the web harness page in headless Chromium against real Steam (modes and env vars at its top), so start the harness first (`npm run dev`). It signs in as the account in `.env`; keep those credentials out of your output. That account's friends are real people: call, message and join only the friend and group the user names for the test, and leave other chats' history unread.
- A test that needs the user on the other end: end the turn with the exact steps for them and wait for their "ready".
- For a feature marked live in the verification table (`packages/vaporchat/README.md`), cite its row instead of re-testing it, except the voice rows its intro flags as predating the direct Steam connection; after verifying a feature live, update its row.

## Docs

- `docs/features.md`: shipped features and the Steam APIs behind each. `docs/features-wont-do.md` lists gaps decided against.
- `docs/ios.md`, `docs/android.md`: building and running the app; iOS releases in `docs/testflight.md`.
