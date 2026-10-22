# Features: pending

Gaps against Steam's own apps that are still open, by area, with the API that backs each and a
rough effort. Paths are relative to `packages/`. What the app already has is in
[`features.md`](features.md); gaps decided against are in
[`features-wont-do.md`](features-wont-do.md), so leave those out of plans.

**Effort:** **easy** = data Steam already sends or one known call; **moderate** = a new endpoint
plus UI, or an unverified part; **hard** = big UI or unclear protocol.

**Unverified** marks an API not confirmed in steam-user's protos, SteamDatabase's `webui` protos
or an anonymous probe of `api.steampowered.com` (401 = needs a token, 405 = needs POST, 404 = CM
only). Confirm it before building on it. "Steam has it in" comes from Steam's news posts
(2019–2026), store and community pages and App Store listings; pages behind a login (store
preferences, account settings) weren't enumerated.

## Before building

- **`callApi` is GET-only** (`vaporchat/steam/store.ts`). Non-const WebAPI reads
  (`GetAchievementsProgress`) and writes (comments, votes) need POST; Steam answers GET with 405.
  `postApi` next to it POSTs, anonymously only so far.
- **Protos.** `ClientComm`, `FamilyGroups`, `Wishlist` writes and `Player.GetPlayerLinkDetails`
  aren't in steam-user's protos. They work over the WebAPI with JSON (an access token where
  needed), so no proto is needed. CM-only methods (all `ChatRoom.*`) are in steam-user's protos;
  anything else over the CM gets copied into `vaporchat/scripts/` like `steamNotification.proto`.
- **Asking Steam for others' status** can sign the official clients out: see the persona-state
  gotcha in [`features.md`](features.md#friends-and-presence). It applies to the member list's
  online members.

## Chat

| Feature | Steam has it in | API | Effort |
|---|---|---|---|
| Link previews (store pages, YouTube, images) | client, Chat app | no proto method found; Steam's clients unfurl themselves (unverified) | moderate |
| @mentions (render, autocomplete, highlight) | client, Chat app | `mentions` on incoming room messages, read today only to alert groups set to mentions; sent as `[mention=…]` BBCode (unverified) | moderate |
| `/store` slash command | client, Chat app | `/code`, `/pre`, `/quote`, `/spoiler` are suggested already and Steam formats them on its side; stickers have the picker; what `/store` sends is unchecked | moderate |

## Voice

Steam has no mobile voice, so these compare against the desktop client and good phone-call
behaviour.

| Feature | Notes | Effort |
|---|---|---|
| Per-user volume and local mute of a participant | Big Picture's voice tab has per-user sliders | moderate |
| Bluetooth / headset route picker, switching when one connects mid-call | speaker off plays through the headset connected at that moment, else the earpiece; the default and the button's label are set when voice starts (`mobile/modules/audio-route`, `mobile/voice.ts`) | moderate |

## Store pages and lists

### Reviews tab

| Feature | API | Effort |
|---|---|---|
| Vote helpful / funny, award, comment | web forms; `LoyaltyRewards.AddReaction` for awards | moderate |

### Wishlist

| Feature | API | Effort |
|---|---|---|
| Wishlist categories (Jul 2026) | `GetWishlistCategories` etc. | moderate |
| Share link | web feature | moderate |

## Feed

| Feature | API | Effort |
|---|---|---|
| Mute a game or source | News Hub settings (unverified endpoints) | moderate |

## Account and app shell

| Feature | Steam has it in | Notes | Effort |
|---|---|---|---|
| Multiple accounts | Steam Mobile, desktop | the token store holds one | moderate |
