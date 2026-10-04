# vaporchat

Steam voice chat (group voice channels and 1:1 friend calls) for web and mobile webviews, built on
[steam-user](https://github.com/DoctorMcKay/node-steam-user).

The library has two halves:

- **Server (Node/Bun):** holds the account's Steam session through steam-user and relays voice
  signaling over any transport (the demo uses a websocket).
- **Browser:** runs the voice chat state machine with the platform's own `RTCPeerConnection`.
  Audio flows directly between the device and Steam's voice servers and never passes through
  the server, so the device's echo cancellation, audio routing and Bluetooth handling all apply.

```
browser / webview ──websocket (signaling)──► server ──CM (steam-user)──► Steam
        └────────────── WebRTC audio ───────────────────────────────────► Steam voice servers
```

## Server

```ts
import SteamUser from 'steam-user';
import { createVoiceProxy } from 'vaporchat/server/voiceProxy';
import { logOnSteam } from 'vaporchat/steam/logOn';

const client = new SteamUser({ renewRefreshTokens: true, dataDirectory: null });
client.on('error', (err) => console.error(err)); // fatal session errors, steam-user stops relogging

await logOnSteam(client, { accountName, password }, dataDir, {
  // optional, without it accounts with Steam Guard can't log in with credentials
  steamGuard: async ({ codeType, emailDomain, canApproveOnDevice, lastCodeWrong }) =>
    askUserForCode(),
});

// one proxy per browser connection
const proxy = createVoiceProxy(client, (message) => socket.send(JSON.stringify(message)));
socket.on('message', (raw) => proxy.handle(JSON.parse(raw)));
socket.on('close', () => proxy.close());
```

- `logOnSteam` logs in with the refresh token stored in `dataDir` (one file per account). It
  only uses the password when there is no token or Steam rejected it, and it saves renewed tokens.
- Steam Guard: email codes, authenticator codes, and approving the login in the Steam mobile app
  all work. With approval, the prompt has `canApproveOnDevice: true` (or `codeType: null` when
  approval is the only option) and the login finishes without the handler's promise resolving.
  Rejecting the handler's promise cancels the login.
- `createVoiceProxy` only forwards the voice-related Steam methods listed in `protocol.ts`. It
  also answers `getMe`, `getFriends`, `getGroups` and `joinGroupByInviteLink`.
- `proxy.close()` leaves every voice channel and hangs up every call the connection was still in,
  because the media died with the browser.
- Authenticate the transport yourself: whoever can talk to the proxy controls the account.

## Browser

```ts
import { SteamVoice } from 'vaporchat/client/steamVoice';

const voice = await SteamVoice.connect('wss://your-server/ws');
const mic = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});

voice.on('incomingCalls', (calls) => showRinging(calls)); // voice.acceptCall / voice.declineCall
voice.on('session', (session) => {
  session?.on('participants', (people) => play(people)); // each has a MediaStream + mute status
  session?.on('speaking', (steamids) => highlight(steamids)); // us included
  session?.on('state', (state) => render(state)); // connecting | ringing | connected | reconnecting | ended
});

const session = await voice.joinGroupVoice(groupId, chatId, mic); // or voice.callFriend(steamid, mic)
session.setMicMuted(true);
session.setOutputMuted(true); // announces deafen, silencing playback is up to you
await session.setMicrophone(otherMic); // null continues listen-only
await session.leave(); // leaves the channel or ends the call
```

- One voice chat at a time, like the official client. Starting a new one leaves the current one.
- Pass `null` as the microphone to join listen-only.
- The caller owns the microphone stream: on `ended`, stop the tracks of `session.microphone`. A
  session that takes over a simultaneous call detaches the microphone first, so that is safe.
- Simultaneous calls: calling a friend who is already calling you accepts their call. Their call
  arriving while you ring them replaces your call without hanging it up. A `session` event
  announces the replacement.
- Play `participant.stream` through an `<audio>` element.
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
  official client, the proxy treats those results as success.
- steam-user ships no encoders for the voice/WebRTC services, so `steam/serviceCalls.ts` sends
  them through steam-user internals (`_send`, `_handlerManager`). **A steam-user update can break
  this file.**

## Verification status

Live means it was tested against real Steam with a person on the other end (desktop Steam client,
headless Chromium running the demo app).

| Feature | Status |
|---|---|
| Stored refresh token login, renewal persistence | live |
| Credential login through steam-session (no Steam Guard) | live |
| Steam Guard codes, approval in the mobile app, cancelling | unit-tested, not live |
| Group voice: join, two-way audio, per-user streams, leave | live |
| 1:1 calls: place, ring, connect, two-way audio, hang up | live |
| Incoming calls: accept, decline, caller cancels | live |
| Mute/deafen sent to Steam, other users' mute status received | live |
| Speaking indicators | live |
| React Native (`react-native-webrtc`) | unverified |
| Proxy leaves voice chats when the client disconnects | live |
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
