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

- Steps 1–4 and 7 of the original plan are done; the server design is gone. Nothing is committed, check `git status`.
- Library (`packages/vaporchat`): `client/connection.ts` (`VoiceConnection`) is a logged-on `SteamCM`
  with typed voice `call`/`notify`, friends (`steam/friends.ts`), groups and invite links
  (`steam/groups.ts`). `SteamVoice.logOn(tokenStore, { credentials, steamGuard, serverListUrl })`
  replaces `connect(url)`. Credential login + Steam Guard run over the CM (`steam/credentialLogin.ts`,
  RSA in `steam/rsa.ts`). Stored tokens get renewed after logon. Each logon sends a random logon id so
  several sessions of one account coexist. steam-user is a dev dependency (protos only).
- Verified live from Bun: credential login, logon, going online, 86 friends with names/avatars/state
  within ~2 s, groups with voice rooms.
- Web harness (`packages/web`): Bun serves the page plus `/cm-list`; the page signs in itself (token in
  localStorage); `scripts/liveVoice.ts` seeds the token from `data/`, fetching one with `.env`
  credentials when missing. Not run live yet.
- Mobile (`packages/mobile`): sign-in with Steam Guard, keychain token store (`tokenStore.ts`), home
  screen with voice rooms, friends and invite links, tap to join/call, incoming calls with
  vibration, call bar (participants, speaking ring, mute, deafen, speaker/earpiece, leave), automatic
  reconnect with backoff, background audio mode. Runs in the iOS 27 simulator, signed in as the bot.
  No call placed from it yet.
- Xcode 27 specifics: the app must adopt the UIScene lifecycle (`plugins/withSceneLifecycle.ts`
  backports Expo SDK 58's template; delete it after upgrading). The simulator app is DeviceHub.
  `modules/audio-route` is a local Expo module (iOS only) that switches earpiece/speaker.

## Running it

- `cd packages/mobile && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx expo run:ios`
  (add `--device` for the phone). Metro: `npx expo start --dev-client`.
- Claude's sandbox can't write `~/.cocoapods` or drive the Simulator via AppleScript: run
  `pod install` yourself after native changes; `expo run:ios` then fails at the very end (after
  installing) on osascript, which is harmless. Open the app with
  `xcrun simctl openurl <udid> "exp+vaporchat://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.

## Next steps

1. First real calls on the phone (needs the user): group voice, calling the user, the user calling
   the app. Open risks: react-native-webrtc accepting Steam's rewritten SDP; iOS `getStats()`
   reporting `audioLevel` + `trackIdentifier` for the speaking ring; the speaker override surviving
   WebRTC's audio session changes.
2. Steam Guard live (the user's account has it).
3. Does Steam end a voice chat when the CM connection drops? The old proxy left chats explicitly.
4. Android: `audio-route` has no Android side yet.

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
