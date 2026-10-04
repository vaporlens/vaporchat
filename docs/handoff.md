# Handoff: vaporchat, serverless rewrite + native iOS app

The next session runs on a Mac (Xcode + paid Apple developer account). Two jobs, in this order:
finish the rewrite that removes the server from the library, then get `packages/mobile` running
on an iPhone with real Steam voice calls.

## Goal

A mobile Steam voice chat app (Steam has no official one): group voice channels, 1:1 friend calls,
voice status. The repo is a **library** (`packages/vaporchat`), a **web debug harness**
(`packages/web`, see its README), and an **Expo app** (`packages/mobile`). Library quality comes first.

## New direction (decided, don't relitigate)

- **No server.** The library talks to Steam's connection managers (CMs) directly over WebSocket,
  the transport Steam's own web/mobile clients use. Login, friends, groups and voice signaling all
  go over it. steam-user is no longer a runtime dependency; it only supplies protobuf definitions
  to `scripts/generateProtos.ts`.
- **The library must work everywhere:** React Native, browsers, Node/Bun. Don't make it RN-only.
  Use only `Uint8Array`/`DataView`, `fetch`, `WebSocket` and `atob`: no Node `Buffer`, `fs` or `crypto`.
- **Browsers need a server for one thing only:** Steam's server list endpoint only allows CORS from
  steamcommunity.com, so browsers pass `serverListUrl` pointing at their own proxy of
  `ISteamDirectory/GetCMListForConnect`. This is documented in the vaporchat README under "Platforms". RN and Node
  fetch Steam directly.
- **`packages/web` stays as a debug harness only:** a Bun server serving the page plus that list proxy,
  and the Playwright live driver. It's not a product.
- App: React Native via an Expo dev build with native UI (not Expo Go, not a WebView, not SwiftUI).
  Closed-app ringing (VoIP push) would need an always-online service; that's deferred, possibly never.

## Done so far

- Commits `0cf6b62`, `b01a37d`. Everything after is uncommitted; the user stages things themselves,
  so check `git status`.
- Library client half (`client/`) is platform neutral (speaking detection from WebRTC stats, no DOM).
  Voice features are verified live: see the table in `packages/vaporchat/README.md`.
- New Steam client (`packages/vaporchat/steam/`):
  - `scripts/generateProtos.ts` → `steam/protos.generated.ts`: only the protobuf types we use (79,
    48 KB). Add type names there and rerun `bun packages/vaporchat/scripts/generateProtos.ts`.
  - `protos.ts`: encode/decode. Registers `long` explicitly, because bundlers hide protobufjs's dynamic
    require and steamids would lose precision.
  - `cm.ts` (`SteamCM`): server pick (`serverListUrl` override), ClientHello, framing, gzipped Multi
    (fflate), service calls (authenticated and not), notifications, `onMessage` by EMsg or
    notification name, heartbeat, close.
  - `eresult.ts`: `EResult` constants, `SteamError`, `hasEResult`.
  - `logOn.ts`: `TokenStore` interface, `steamIdFromRefreshToken`, `logOnWithRefreshToken`, and the
    `logOnSteam` orchestrator (stored token first, credentials as fallback). `logOn.test.ts` covers
    it against a fake Steam connection.
- Verified live from Bun: logon with the stored refresh token works, and `ChatRoom.GetMyChatRoomGroups`
  returns the test group. Verified from Chromium: WebSocket to a CM works, but the server-list fetch is
  blocked by CORS.
- `packages/mobile`: Expo SDK 57 scaffold with react-native-webrtc, a placeholder connect screen that
  still expects the old server link, and bundle id `com.yamalight.vaporchat`. Never built on a device.

## Current breakage (expected mid-rewrite)

- `npm run check` fails on one file: `packages/web/server.ts` still calls the old steam-user login.
  The web harness can't run until step 4. Biome, the library type check and the tests (19) pass.
- Still on the old design, but compiling: `server/*`, `steam/serviceCalls.ts`, `steam/refreshToken.ts`,
  `packages/web/src/app.ts`, and the `voiceProxy` tests.
- `steam/credentialLogin.ts` still uses steam-session, which is Node-only. `logOnSteam` imports it, so
  until step 2 the library's login path isn't usable in React Native or browsers.
- Token renewal is gone with steam-user; its old test was removed (see step 6).

## Next steps

1. **Steam-backed connection.** Replace `client/connection.ts`, the websocket to the old server, with a
   class over `SteamCM` that keeps the same `call` / `notify` / `on` / `'close'` shape, so `VoiceSession`
   and `SteamVoice` barely change. Reuse from `server/voiceProxy.ts`: the derived proto names, the
   `failIsExpected` handling (Steam answers acks and declines with Fail) and the notification type
   map. App methods:
   - Friends: `ClientFriendsList` plus `ClientRequestFriendData` (flags 1|2|16) and `ClientPersonaState`.
     Build the avatar URL from the `avatar_hash` hex the way steam-user does in `components/friends.js`.
   - Groups: `GetMyChatRoomGroups` + `SetSessionActiveChatRoomGroups`. `members_in_voice` holds account
     ids, not SteamID64s.
   - Invite links: `GetInviteLinkInfo` + `JoinChatRoomGroup`.
   - Go online after logon with `ClientChangeStatus` (`persona_state: 1`).
   - Gotcha: the friends list arrives in the same Multi as the logon response, so register handlers
     **before** sending ClientLogon. Add a hook to `logOnWithRefreshToken` or build the connection
     around it.
2. **Credential login + Steam Guard over CM.** Use the unauthenticated `Authentication.*` calls (types
   already generated). The password is RSA-encrypted, PKCS#1 v1.5, with BigInt; it needs random bytes
   from `crypto.getRandomValues`, which React Native lacks without expo-crypto or
   react-native-get-random-values. Port the prompt logic and tests from the current `credentialLogin.ts`.
3. **Delete the server design:**
   - `server/` and its tests
   - `steam/serviceCalls.ts`, `steam/refreshToken.ts`
   - the wire message types in `protocol.ts`
   - the steam-session dependency; move steam-user to devDependencies
4. **Web debug harness.**
   - The Bun server serves the page and a `/cm-list` proxy only.
   - The page logs in itself, with the token in localStorage.
   - The live driver injects the token from `data/`.
5. **Mobile.**
   - A `TokenStore` on expo-secure-store and a login screen.
   - Build: `npm install`, then `cd packages/mobile && npx expo run:ios --device`.
   - Then the first real call. Open risks: react-native-webrtc accepting Steam's rewritten SDP, and iOS
     `getStats()` reporting `audioLevel` + `trackIdentifier`, which speaking detection needs.
6. **Open questions to verify live:**
   - Does Steam end a voice chat when the CM connection drops? The old proxy left chats explicitly on
     disconnect.
   - Refresh token renewal is not implemented yet. steam-user's `renewRefreshTokens` is the
     reference; tokens last about 200 days.
7. Rewrite `packages/vaporchat/README.md` once the old design is gone.

## Live testing setup

- Bot account credentials, `VAPORCHAT_KEY` and `VAPORCHAT_DEBUG=1` are in `.env`; never print them.
  Bun loads `.env` from the cwd. The bot's refresh token is in `data/` (gitignored). The bot has no
  Steam Guard.
- The human on the other end is the user, from their own Steam account. Group: "Voice Test Group"; the
  bot is a member and there's a voice room. The bot account is real and has many friends: **only
  call the user, only join that group, never read message history.**
- `packages/web/scripts/liveVoice.ts` has its modes and env vars documented at the top.

## How the user wants to work (important)

- **Never touch git:** no staging, committing or pushing. "Write a commit" means write the message text
  only, using the template in the user's global CLAUDE.md.
- **Before any test that needs the user,** end the turn with exact instructions and wait for "ready".
  Never start such a test mid-turn.
- No fixed `sleep N`: wait on real conditions such as `until grep …` loops or task notifications.
- Don't re-test what's verified (README table); document instead.
- Don't add servers or browser-only workarounds to the app path, and don't narrow the library to one
  platform. Ask when a decision changes the architecture.
- Surgical changes, no `any`, files may go a bit over 500 lines.

## Suggested skills

- `run`: launching the Expo app, the web debug harness and the live driver.
- `diagnosing-bugs`: when the CM client or WebRTC misbehaves (on iOS especially).
- `tdd` / `test-audit`: porting the credential-login tests and adding tests for the new client.
- `simplify`: after the rewrite lands.
- `codebase-design`: for the connection seam (Steam-backed connection vs `VoiceSession`).
