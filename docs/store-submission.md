# Store submission: App Store and Google Play

What to upload and fill in for Vaporlens (`org.vaporlens.Vaporlens`) on both stores, and what is
still open. Building and uploading the binaries is in [`testflight.md`](testflight.md) and
[`android.md`](android.md). The privacy policy both stores ask for is at
https://vaporlens.app/privacy.

## Open before submitting

- [ ] **Support URL** (App Store, required) and a **contact email** (Play, required). The public GitHub
      repo's issues page (https://github.com/vaporlens/vaporchat/issues) can be the support URL.
- [ ] **Demo account for review.** Both stores need a Steam account that signs in without Steam Guard
      (reviewers can't get the code), ideally with a friend or two and a group with a voice channel.
- [ ] **Account deletion (App Store 5.1.1(v)).** Signing in to Steam also signs the user in to
      vaporlens.app (`signInToVaporlens` in `packages/mobile/vaporlens.ts`), which keeps their
      SteamID and, after an import, their library and wishlist. Apple treats that as account
      creation, so the app has to offer a way to delete that data, at least a link to a web page
      that does it. The app has none today.
- [ ] **"Stay connected" foreground service type.** With no call running, `CallService.kt` runs as
      `remoteMessaging`. Play's use case for that type is relaying text messages to another device
      (texts sent from a web client), which keeping a Steam chat connection alive doesn't match
      closely. Expect questions on that declaration (see [Foreground services](#foreground-services)).

## Media

Rendered by `bun media/render.ts` from `media/captures/` (see the script's header). All PNG, no
alpha.

| Store field | File | Size |
| --- | --- | --- |
| App Store, iPhone 6.3" display | `media/app-store/iphone-6.3/*.png` | 1206×2622 |
| App Store, product page header | `media/app-store/header.png` | 3840×1646 |
| App Store, search results | `media/app-store/search-results.png` | 3840×2560 |
| App Store icon | from the build (`packages/mobile/assets/icon.png`) | 1024×1024 |
| Play phone screenshots | `media/play-store/phone/*.png` | 1080×1920 |
| Play feature graphic | `media/play-store/feature-graphic.png` | 1024×500 |
| Play app icon | `media/play-store/icon-512.png` | 512×512 |

The header and search results images go in Product Page Information → Header and Search Results
(shown on iOS 27 and later). Their text sits in the safe areas of Apple's templates (1646×661 and
2168×1030, centered); the phones around it may be cropped. Apple's templates are at
https://developer.apple.com/app-store/asset-best-practices/ to check against.

App Store Connect asks for the 6.3" size (1206×2622 or 1179×2556). Upload in the files' number
order. On iOS the first three appear in search results, and Google wants the strongest screens
first.

| # | Slide | Caption | Play alt text (max 140) |
| --- | --- | --- | --- |
| 1 | `vaporlens` | Game reviews at a glance | VaporLens summary of a game's Steam reviews with scores for reviews, microtransactions, mods, Linux and Steam Deck |
| 2 | `voice-chat` | Steam voice chat on your phone | Friends list grouped by the game each friend plays, with a voice call in progress at the bottom |
| 3 | `review-points` | What players love and what they don't | Lists of what players like, common complaints, gameplay and performance, summed up from reviews |
| 4 | `game-page` | A fully native Steam experience | Steam store page for a game with its price, discount, review score, tabs and description |
| 5 | `releases` | Find your next game | Grid of new releases on Steam with prices and discounts |
| 6 | `events` | News and events from your games | Feed of Steam sale events with their banners and descriptions |

Captions follow Play's rules: no ranking, price or "new" claims and no calls to action.

Every screenshot shows game art, which is someone else's trademark. Play asks for permission for
third-party trademarks. The shots use Clair Obscur: Expedition 33 (Sandfall Interactive / Kepler
Interactive) and whatever the store lists showed on 2026-10-24.

## App Store Connect

**Name** (30): `Vaporlens`

**Subtitle** (30): `Native Steam companion + voice`

**Category:** Entertainment, secondary Reference (Apple: "apps that assist the user in accessing or
retrieving information", i.e. the review summaries and game pages).

**Promotional text** (142 of 170; shown above the description, can change without a new
submission):

```
See what Steam reviews say about a game before you buy it, summed up by VaporLens. Then jump into your group's voice channel or call a friend.
```

**Description** (4000): use the [shared description](#description) below.

**Keywords** (97 of 100, comma-separated, no spaces after commas). Apple's rules: no words from
the name, subtitle or category, no plurals of words already used, nothing too broad like "game", no
other apps' or companies' names:

```
reviews,summary,worth it,pros cons,chat,call,friends,wishlist,deals,pc gaming,linux,deck,playtime
```

**Copyright:** `2026 Tim Ermilov`

**App Review information**

- Sign-in required: yes. Demo account: the Steam account from [Open before submitting](#open-before-submitting).
- Notes:

  ```
  Vaporlens is an unofficial Steam companion app, not affiliated with Valve. Game review summaries come from VaporLens (vaporlens.app), our own service.

  SIGNING IN
  Store, Releases, Feed and game pages work without signing in. Chat, voice, Wishlist and My games need a Steam account: tap "Sign in" and use the demo account above. Steam Guard is off for it, so no code is asked. The password goes only to Steam.

  VAPORLENS (main feature)
  Open any game, e.g. search "Clair Obscur" in the Store tab. The VaporLens section on the game's Overview tab shows the review summary and scores. Tap a score for its details. "Your fit" works for the demo account, whose library is already imported.

  VOICE
  Chat tab > "Voice Test Group" > "Join" on a voice channel. iOS asks for the microphone the first time. You can join alone to see it work. The friend rows' call button places a 1:1 call. The background audio mode keeps an active call going with the app in the background or the screen locked. It is only used during calls.

  PURCHASES
  The app sells nothing. Prices are those of PC games on Steam. "Open in Steam" opens the game's Steam page in the Steam app or Safari.
  ```

**Age rating questionnaire:** answer from what the app does:

- User-generated content and messaging: yes. Chat and voice with Steam friends and groups.
- Web access: links in chats and on store pages open in the browser, not in the app.
- Mature or suggestive themes: the store shows games' own descriptions, tags and art (tags like
  "Nudity" appear on some pages). The app has no age check of its own.
- No gambling, no contests, no purchases in the app ("Open in Steam" hands off to Steam).

**Export compliance:** already answered by `usesNonExemptEncryption: false`.

**App Privacy (nutrition labels):** see [Privacy](#privacy).

## Google Play Console

**App name** (30): `Vaporlens`

**Short description** (80):

```
See what Steam reviews say about any game, and voice chat with your friends
```

**Full description** (4000): the [shared description](#description).

**Category:** Entertainment. **Tags** (Store settings → Manage tags, up to 5): "Entertainment",
"Communication". Play has no tag for game reviews or game stores in apps (as of its September 2024
list); check Manage tags for newer ones.

**Sign-in details** (Policy and programs → App content): some functionality needs sign-in (Chat
and voice, Wishlist, My games, Releases → For you, Feed → Activity, and "Your fit" and the
wishlist / follow / ignore buttons on game pages); the store, releases, news, events and game pages
with their VaporLens summary work signed out. Give the demo account and the same steps as the App
Review notes. Play wants credentials that are reusable and skip any one-time codes.

**Ads:** no. **In-app purchases:** none.

**Content rating (IARC questionnaire):** category "Social or communication", same answers as the
Apple age rating: users can talk and share images with each other; no location sharing; no digital
purchases.

**Target audience:** 13+ or 18+. Chat with strangers in Steam groups is possible, which rules out
a children's audience.

**News app:** no (the feed shows Steam's news posts, but the app isn't a news publisher).

### Foreground services

Play asks, per type in the manifest (`modules/call-service`), for a description, the impact of
deferring the task, and a link to a video showing how the user triggers it. Record each on a phone
and upload them unlisted to YouTube.

| Type | When | Description | Video shows |
| --- | --- | --- | --- |
| `microphone` | in voice, microphone allowed | Voice chat in Steam group channels and 1:1 calls keeps the microphone live while the app is in the background, like a phone call. Deferring it cuts the user's voice off mid-call. | Join a voice channel, speak, switch to another app, the call notification stays and the others still hear you. |
| `mediaPlayback` | in voice, listen-only | Without the microphone permission voice joins listen-only, and keeps playing the call's audio in the background. Deferring it cuts the call's audio off. | Deny the microphone, join a voice channel, go to another app, the call keeps playing. |
| `remoteMessaging` | "Stay connected" in Settings | Keeps the Steam chat connection open in the background so messages and calls from friends alert the user. Off by default, turned on by the user. Deferring it means messages and incoming calls are missed. | Settings, turn on Stay connected, leave the app, a friend sends a message, its notification arrives. |

`remoteMessaging` is the open item above. If Play refuses it, the alternative is dropping "Stay
connected" on Android until there's push.

### Permissions

- `RECORD_AUDIO`: voice chat. `CAMERA`: taking a photo to send in a chat.
- `POST_NOTIFICATIONS`: message and call alerts.
- No `SYSTEM_ALERT_WINDOW` (blocked in `app.json`), no location, no contacts.

## Description

Shared by both stores (plain text, 1761 of 4,000 characters):

```
Is this Steam game worth it? Open any game and VaporLens tells you what its Steam reviews say, in a few lines.

VAPORLENS REVIEW SUMMARIES
• What players like, their common complaints, and notes on gameplay, performance and recommendations
• Monetization red flags like pay-to-win and gacha, how often players need mods to make the game feel complete, and how often they need a wiki to understand it
• How it does on Steam Deck and Linux
• A community fair price, how many hours it lasts and how quickly it gets fun
• How players feel about it, what kinds of players enjoy it, and how it runs on different hardware
• Your fit: how close the game is to what you already play, once you import your library
• Similar games, and a request button for games VaporLens hasn't covered yet

STEAM VOICE CHAT
• Join your groups' voice channels or call a friend
• Keep talking with the screen off, on the speaker, earpiece or a headset
• Mute, deafen, and set each person's volume

A FULLY NATIVE STEAM EXPERIENCE
• Game pages with media, DLC and editions, system requirements, news and a chart of reviews over time
• Discounts, top sellers, new releases, and browsing by hub or tag
• Your wishlist with its categories, and your library with playtime
• Wishlist, follow or ignore games, and hide the ones you own from store lists
• Chat with friends and groups, with stickers, photos, reactions, mentions and link previews; unread messages stay in sync with Steam
• News from your games, friends' activity and store events
• Several Steam accounts, and switching between them

You sign in to Steam directly. Your password goes only to Steam.

Vaporlens is an unofficial app, not affiliated with or endorsed by Valve Corporation. Steam is a trademark of Valve Corporation.
```

## Privacy

What leaves the device, from the code:

| Data | Goes to | Why | Code |
| --- | --- | --- | --- |
| Steam login, messages, photos, voice, friends, store actions | Steam (Valve) directly | the Steam features themselves | `packages/vaporchat` |
| SteamID, via Steam's signed OpenID assertion (never the Steam token) | vaporlens.app | the VaporLens sign-in, done automatically after Steam's | `signInToVaporlens` |
| Library and wishlist (fetched by vaporlens.app from Steam, on import) | vaporlens.app | the "Your fit" score | `/api/mobile/import` |
| Games whose fit is asked for, analysis requests | vaporlens.app | fit score, analysis queue | `/api/mobile/fit`, `/api/mobile/queue` |

No analytics, crash reporting, ads or tracking SDKs. Steam's token and the VaporLens session sit in
the device keychain (SecureStore); caches stay on the device.

**App Store privacy labels, draft.** Data sent to vaporlens.app (our service) counts as collected:

- Identifiers → User ID (the SteamID): linked to the user, App Functionality, not tracking.
- Purchases → Purchase History (the imported library and wishlist): linked, App Functionality.
- Usage Data → Product Interaction (fit lookups, analysis votes): linked, App Functionality.

Messages, photos and voice go to Steam, the service the user signs in to, and not to us. Whether
Apple's labels should list them anyway (as Other User Content, Photos, Audio Data) is a judgment
call; listing them is the cautious choice.

**Play Data safety, draft:** the same three data types as collected, encrypted in transit, not
shared with third parties, not optional (sign-in does it). "Can users request deletion?" needs
the deletion path from the open items above.

Check both drafts against what vaporlens.app actually stores and for how long, which isn't in
this repo.

## Re-shooting the media

On the Android emulator (`Medium_Phone_API_37.0`, 1080×2400) with a dev build:

1. Dev menu (`adb shell input keyevent 82`): turn off "Tools button", or the gear shows in every
   shot.
2. Clean status bar (it's cropped off anyway, this only keeps captures tidy):

   ```sh
   adb shell settings put global sysui_demo_allowed 1
   adb shell am broadcast -a com.android.systemui.demo -e command enter
   adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
   ```

3. Capture, then crop the status bar (63 px) and navigation bar (63 px) off:

   ```sh
   adb exec-out screencap -p > shot.png
   magick shot.png -crop 1080x2274+0+63 +repage media/captures/phone/<slide>.png
   ```

4. `bun media/render.ts` (or `bun media/render.ts play` / `iphone` for one set).
   Captions and slide order are `SLIDES` in `media/render.ts`.

The current captures: `vaporlens` and `review-points` are Clair Obscur: Expedition 33's VaporLens
section, `game-page` its page top, `releases` Releases → Popular new, `events` Feed → Events, all
on the VaporBot test account. `voice-chat` is the Chat tab during a 1:1 call with yamalight, the two
other friends' names blurred (`magick` `-blur 0x14` on each name's box); its slide sets
`keep: 'bottom'` so Play's shorter canvas still shows the call controls.
