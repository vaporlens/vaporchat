# vaporchat

Steam voice and text chat (group chat rooms and 1:1 friend calls and messages) for React Native,
browsers and Node/Bun, with no server in between.

- **Steam connection (`steam/`):** a protobuf client for Steam's connection managers over WebSocket,
  the transport Steam's own web and mobile clients use. Login (refresh token or password with
  Steam Guard), friends, group chats, text messages and voice signaling all go over it.
- **Voice client (`client/`):** the voice chat state machine on the platform's own
  `RTCPeerConnection`. Audio flows directly between the device and Steam's voice servers, so the
  device's echo cancellation, audio routing and Bluetooth handling all apply.

```
app ──WebSocket (login, friends, groups, signaling)──► Steam connection manager
 └──────────── WebRTC audio ──────────────────────────► Steam voice servers
```

## Platforms

The library talks to Steam directly, with no server in between (see `steam/cm.ts`). It runs in
React Native, Node/Bun and browsers. **Browsers need a server for one thing:** Steam's API only allows CORS
from steamcommunity.com, so a browser page can't fetch Steam's server list. Serve that list from
your own backend (proxy `https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0`)
and pass its URL as `serverListUrl`. Everything else, including login, goes over a WebSocket to Steam,
which browsers allow. The exceptions are `sendImage`, which like Steam's own chat uploads through
`https://steamcommunity.com/chat/`, and the store feeds (`getSpecials`, `getNewReleases`, `getNews`,
`getWishlist` and the rest), which read store.steampowered.com and api.steampowered.com. Those have no CORS either, so browsers
need a proxy for them too.

Password login and `sendImage` use `crypto.getRandomValues`. React Native has to polyfill it (the
app uses `expo-crypto`); logging on with a stored refresh token doesn't need it.

## Client

```ts
import { SteamVoice } from 'vaporchat/client/steamVoice';

// stored refresh token first, credentials only when there is none or Steam rejected it
const voice = await SteamVoice.logOn(tokenStore, {
  locale: 'de-DE', // sale events' texts in its language where they have it, english otherwise
  credentials: { accountName, password },
  steamGuard: async ({ codeType, emailDomain, canApproveOnDevice, lastCodeWrong }) =>
    askUserForCode(),
});
voice.connection.friends; // online first, updates as `friendsChanged`
await voice.connection.getGroups(); // fetch again on `groupsChanged`
const mic = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});

voice.on('incomingCalls', (calls) => showRinging(calls)); // voice.acceptCall / voice.declineCall
voice.on('session', (session) => {
  session?.on('participants', (people) => play(people)); // each has a MediaStream + mute status
  session?.on('speaking', (steamids) => highlight(steamids)); // us included
  session?.on('state', (state) => render(state)); // connecting | ringing | connected | reconnecting | ended
});

// text chat, with a friend or in a group chat room
const chat = { kind: 'friend', steamid } as const; // or { kind: 'room', groupId, chatId }
await voice.connection.getRecentMessages(chat); // last 50, oldest first
voice.connection.on('message', ({ chat, message }) => show(chat, message)); // every chat
await voice.connection.sendMessage(chat, 'hi :steamhappy:'); // resolves with the stored message
const { emoticons, stickers } = await voice.connection.getEmoticons(); // what the account owns
await voice.connection.sendMessage(chat, stickers[0]); // a sticker is a message of its own
await voice.connection.sendImage(chat, { bytes, type: 'image/jpeg', width, height }); // Steam posts it

// what Steam's store and client show
const { feeds } = voice.connection;
await feeds.getSaleEvents(); // sales running now
await feeds.getSpecials(); // the store's top discounts
await feeds.getTopSellers(); // best selling first
const wishlist = await feeds.getWishlist(); // the user's, biggest discounts first; pages like news
await feeds.getNewReleases(); // popular new releases, newest first
await feeds.getUpcoming(); // popular games coming soon
await feeds.getPersonalCalendar(); // releases of the next 3 days Steam picked for the user
await feeds.getGame(appid); // a store page: reviews, tags, screenshots, description
await feeds.getStoreItems(bundle.includedAppids); // a bundle's games
await feeds.getSalePage(event.id); // a sale event's sections: texts and their games
const news = await feeds.getNews(); // the News Hub's "Your News", newest first
await feeds.getNews(news.next); // older ones, `next` is null at the end
await feeds.getFriendsActivity(); // achievements, purchases, screenshots; pages like news
```

- `logOn` saves fresh tokens to the `TokenStore` (keychain on phones, localStorage on web) and
  swaps the stored token for a renewed one when Steam offers it. Tokens last about 200 days.
- Steam Guard: email codes, authenticator codes, and approving the login in the Steam mobile app
  all work. With approval, the prompt has `canApproveOnDevice: true` (or `codeType: null` when
  approval is the only option) and the login finishes without the handler's promise resolving.
  Rejecting the handler's promise cancels the login.
- `voice.connection.user(steamid)` returns anyone's name and avatar, looking up strangers (people
  in a group voice room) on first use. `joinGroupByInviteLink` joins `https://s.team/chat/…` links.
- Each logon picks a random logon id, so the same account can be signed in from several devices.
- Store descriptions and news posts come as `RichBlock`s to render (paragraphs, headings, lists,
  pictures, videos, links), parsed from Steam's BBCode by `steam/richText.ts`.
- The feeds use the endpoints Steam's own store, News Hub and client use, none of them documented.
  Store prices follow the country Steam located the connection in at logon. Friends' activity
  comes over the Steam connection (`UserNews.GetUserNews`, its protobuf is in
  `scripts/userNews.proto`), news, the wishlist and the personal calendar use a web session like
  `sendImage`, and the other store lists need no login.
- Messages come as `parts` to render: text, emoticons, stickers and images with their URLs (other
  BBCode such as links and quotes reads as its text). Our own messages sent from other devices come
  as `message` too, with the same `id` as the one `sendMessage` returned: `mergeMessages` and
  `chatKey` from `steam/messages` keep one list per chat.
- Sending works like Steam's own clients: Steam turns `:name:` into an emoticon and
  `/sticker <name>` into a sticker when the sender owns it. BBCode tags sent directly are dropped,
  and `sendMessage` escapes brackets in text.
- One voice chat at a time, like the official client. Starting a new one leaves the current one.
- Pass `null` as the microphone to join listen-only.
- The caller owns the microphone stream: on `ended`, stop the tracks of `session.microphone`. A
  session that takes over a simultaneous call detaches the microphone first, so that is safe.
- Simultaneous calls: calling a friend who is already calling you accepts their call. Their call
  arriving while you ring them replaces your call without hanging it up. A `session` event
  announces the replacement.
- Browsers play `participant.stream` through an `<audio>` element; react-native-webrtc plays
  remote audio by itself, so deafening there means disabling the remote tracks.
- Steam has no speaking signal, so the session derives one from the audio levels WebRTC reports.
- No DOM or Web Audio is used, so the browser half also runs in React Native with
  `react-native-webrtc` (after its `registerGlobals()`).

## How it talks to Steam

The flow follows Valve's own web client:

1. The browser creates an offer and sends it with `WebRTCClient.InitiateWebRTCConnection`.
2. Steam answers. Its voice servers are ICE-lite and need no STUN/TURN.
3. Once ICE is connected and `NotifyWebRTCSessionConnected` has arrived, the browser joins
   (`ChatRoom.JoinVoiceChat`, or `VoiceChat.RequestOneOnOneChat` / `AnswerOneOnOneChat`) and binds
   the session with `VoiceChat.UpdateVoiceChatWebRTCData`.
4. Steam adds and removes participants by sending new offers. The browser answers them locally and
   only acknowledges the version to Steam.

Quirks the library handles:

- Steam describes all participants in one Plan-B m-section. Browsers only accept Unified Plan, so
  `client/planB.ts` rewrites Steam's descriptions into one m-section per participant. This is
  safe because Steam never sees our answers.
- Steam echoes our own SSRC back as a `Self-…` stream. It's dropped so the browser doesn't
  change its sending SSRC.
- Steam answers acknowledgements and declines with `Fail` even when they worked. Like the
  official client, `client/connection.ts` treats those results as success.
- Steam sends the friends list in the same message batch as the logon response, so its handlers
  are registered before logging on (`beforeLogOn`).
- Protobuf definitions come from steam-user (a dev dependency only):
  `scripts/generateProtos.ts` extracts the types in use into `steam/protos.generated.ts`.

## Verification status

Live means it was tested against real Steam with a person on the other end (desktop Steam client,
headless Chromium running the old server-based demo). Voice rows were verified before the move to the
direct Steam connection; signaling is unchanged, but they haven't been re-run over it yet.

| Feature | Status |
|---|---|
| Stored refresh token login | live (Bun, iOS simulator) |
| Refresh token renewal | unit-tested, not live (Steam only renews close to expiry) |
| Credential login over the Steam connection (no Steam Guard) | live (Bun) |
| Friends with names, avatars, online state; groups with voice rooms | live (Bun) |
| Steam Guard codes, approval in the mobile app, cancelling | unit-tested, not live |
| Group voice: join, two-way audio, per-user streams, leave | live |
| 1:1 calls: place, ring, connect, two-way audio, hang up | live |
| Incoming calls: accept, decline, caller cancels | live |
| Text chat: friend and room messages, history, sending (brackets escaped), echo dedupe | live (Bun) |
| Receiving emoticons, stickers, images; listing and sending owned emoticons and stickers | live (Bun) |
| Sending images to friends and rooms | live (Bun) |
| Store feeds: sale events and top discounts, new releases, your news, friends' activity, paging | live (Bun) |
| Store feeds: top sellers, upcoming, wishlist (private too), personal calendar | live (Bun), wishlist paging not tried (bot's fits one page) |
| Game pages; store descriptions and news posts as rich text | live (Bun) |
| Sale event pages with their games, bundles included | live (Bun) |
| iOS app: Store, Releases, Feed tabs and their lists | installed on the phone, not tried yet |
| iOS app: game and article screens | iOS simulator (rendering only) |
| iOS app: bundle screens with their games | not tried yet (bundle games live in Bun) |
| iOS app: sale screens, VaporLens analysis on game screens | iOS simulator (rendering only) |
| iOS app: chat screen, unread badges, emoticons, animated stickers, image viewer, emoticon and sticker picker, sending photos | live (phone) |
| Mute/deafen sent to Steam, other users' mute status received | live |
| Speaking indicators | live |
| iOS app: sign in, friends, groups, tap to join/call | iOS simulator, no call placed yet |
| React Native voice (`react-native-webrtc`) | unverified |
| Steam ends a voice chat when the connection drops | unverified |
| `setMicrophone`: turn the mic off and back on mid-call | live |
| `setMicrophone`: swap to another mic, add a mic to a listen-only chat | unverified |
| Calling a friend who is already calling you accepts their call | live |
| Both sides calling at the same moment | unverified |
| Rejoin on `NotifyShouldRejoinChatRoomVoiceChat`, retries with backoff | unverified |
| Three or more participants | Plan-B conversion unit-tested, not live |
| Firefox, Safari, mobile webviews | unverified (only Chromium tested) |

A second Steam account would make all the unverified rows testable without a person: one headless
instance sends while another measures the audio it receives.

## Development

```bash
npm run check   # biome + tsc
npm test        # vitest
```
