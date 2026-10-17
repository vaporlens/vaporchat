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
- **Protos.** `ClientComm`, `FamilyGroups`, `Wishlist` writes and `Player.GetPlayerLinkDetails`
  aren't in steam-user's protos. They work over the WebAPI with JSON (an access token where
  needed), so no proto is needed. CM-only methods (all `ChatRoom.*`) are in steam-user's protos;
  anything else over the CM gets copied into `vaporchat/scripts/` like `steamNotification.proto`.
- **Asking Steam for others' status** can sign the official clients out: see the persona-state
  gotcha in [`features.md`](features.md#friends-and-presence). It applies to profiles and the
  member list's online members.

## Friends

| Feature | Steam has it in | API | Effort |
|---|---|---|---|
| Favorites and custom categories | client, Chat app | `FriendsList.GetCategories/GetFavorites/SetFavorites` | moderate |
| Profiles (level, recent games, showcase, comments) | web, client, mobile web view | `Player.GetPlayerLinkDetails`, `GetProfileItemsEquipped`, `GetProfileCustomization` (token, JSON) | moderate |
| Report a user | client, web | web form (unverified) | moderate |

## Chat

| Feature | Steam has it in | API | Effort |
|---|---|---|---|
| Quotes, spoilers, code in messages | client | BBCode, flattened to text today | easy |
| Send a spoiler image | client | `spoiler` flag of the upload, fixed to 0 (`vaporchat/steam/imageUpload.ts`) | easy |
| Camera capture for photos | Chat app | camera permission blocked in `mobile/app.json` | easy |
| Date separators, message search | client | client-side | easy |
| Link previews (store pages, YouTube, images) | client, Chat app | no proto method found; Steam's clients unfurl themselves (unverified) | moderate |
| @mentions (render, autocomplete, highlight) | client, Chat app | `mentions` on incoming room messages, read today only to alert groups set to mentions; sent as `[mention=…]` BBCode (unverified) | moderate |
| Create group, invite friends, create invite link | client, Chat app | `CreateChatRoomGroup`, `InviteFriendToChatRoomGroup`, `CreateInviteLink` | moderate |
| Leave group, rename, tagline, avatar | client, Chat app | `LeaveChatRoomGroup`, `RenameChatRoomGroup` | moderate |
| Moderation: delete messages, kick, ban | client | `ChatRoom.DeleteChatMessages` (rooms only, no 1:1 delete exists), kick/ban methods | moderate |
| Slash commands (`/store`, `/sticker` picker, …) | client, Chat app | client-side | moderate |
| Chat filtering (profanity, custom words) | client, Chat app | account setting, client-side filtering (unverified) | moderate |
| Suspicious-link warnings, report message | client | client-side + web report (unverified) | moderate |
| Game invites / Remote Play Together invites | client, Chat app | entry types and RPT signalling (unverified) | hard |

## Voice

Steam has no mobile voice, so these compare against the desktop client and good phone-call
behaviour.

| Feature | Notes | Effort |
|---|---|---|
| Showing more than one incoming call | only `calls[0]` is shown (`mobile/screens/IncomingCall.tsx`) | easy |
| Notification actions (mute, hang up) | the Android call notification has none (`mobile/modules/call-service`) | easy |
| Switching microphone mid-call | the library has `setMicrophone`, the app doesn't expose it | easy |
| Per-user volume and local mute of a participant | Big Picture's voice tab has per-user sliders | moderate |
| Bluetooth / headset route picker, switching when one connects mid-call | speaker off plays through the headset connected at that moment, else the earpiece; the default and the button's label are set when voice starts (`mobile/modules/audio-route`, `mobile/voice.ts`) | moderate |
| Push-to-talk, voice activity threshold | desktop client | moderate |

## Notifications

| Feature | Steam has it in | API | Effort |
|---|---|---|---|
| Hide a notification | client, web | `HideNotification` | easy |

## Store pages and lists

### Reviews tab

| Feature | API | Effort |
|---|---|---|
| Filters: positive/negative, recent, date range, purchase type, playtime | `appreviews` `review_type`, `filter`, `day_range`, `purchase_type` | easy |
| Funny votes, "received for free", Early Access, Steam purchase labels | already in the response, not read (`vaporchat/steam/reviews.ts`) | easy |
| Total playtime of the author (only playtime at review shown) | `author.playtime_forever` | easy |
| Developer responses | `developer_response` in the response (unverified field name) | easy |
| Histogram of positive/negative over time | `appreviewhistogram/{appid}` | moderate |
| Vote helpful / funny, award, comment | web forms; `LoyaltyRewards.AddReaction` for awards | moderate |
| Write or edit your own review | web form (unverified) | moderate |

### Lists (Store, Releases, search)

| Feature | Notes | Effort |
|---|---|---|
| Free to play, demos, Early Access, VR, Steam Deck hubs | `search/results` filters, tag hubs | easy |
| Tag and genre browsing | `GetTagList` (already loaded) + search by tag | easy |
| Store search filters and sorting | search is name-only; Steam has price, tags, features, platform, language and Deck filters | moderate |
| Search suggestions while typing | the query waits 3.5 s idle (`mobile/screens/Feed.tsx`) | moderate |
| Discovery Queue | `Store.GetDiscoveryQueue`, `SkipDiscoveryQueueItem` (token) | moderate |
| Store home: Featured & Recommended, wishlist-on-sale, DLC for your games | `IStoreMarketingService`, `GetDLCForApps` | moderate |
| Charts: most played, weekly top sellers, top releases of the month | store charts endpoints (unverified) | moderate |
| Curators: follow, browse their picks | web endpoints (unverified) | moderate |
| Store preferences respected (ignored games, excluded tags, mature content) | `Store.GetStorePreferences`, `StorePreferences.GetIgnoreList`; `apply_user_filters` on `GetItems` | moderate |
| Interactive Recommender, Community Recommendations | unverified endpoints | moderate |

### Wishlist

| Feature | API | Effort |
|---|---|---|
| Date added, review score on the cards | `date_added` in the response; reviews via `GetItems` | easy |
| Wishlist categories (Jul 2026) | `GetWishlistCategories` etc. | moderate |
| Reorder | `Wishlist` service writes (POST) | moderate |
| Share link | web feature | moderate |

### My games (library)

| Feature | API | Effort |
|---|---|---|
| Family shared library | `FamilyGroups.GetSharedLibraryApps` | moderate |
| Collections | stored in the client's cloud config (unverified) | hard |
| Game notes | client-side cloud storage (unverified) | hard |

### Sale, bundle and article pages

| Feature | Notes | Effort |
|---|---|---|
| Sale page: the event's full body | only `summary` is shown (`mobile/screens/SaleScreen.tsx`) | easy |
| Article: link to the game's page | `appid` is on the event but unused (`mobile/screens/ArticleScreen.tsx`) | easy |
| Sale page: tabs, trailers, dynamic sections | dropped on purpose (`vaporchat/steam/salePage.ts`); not checked whether big sales build game lists in ways this drops | moderate |
| Bundle page: bundle discount explanation, "complete the set" price for owned items | `GetItems` purchase options | moderate |
| Article: rate-up count, comments | `Community.RateClanAnnouncement`, `GetCommentThread` (POST) | moderate |

## Feed

| Feature | API | Effort |
|---|---|---|
| Activity: achievement descriptions | fetched but not shown (`mobile/screens/FeedCards.tsx`) | easy |
| Mute a game or source, follow news curators | News Hub settings (unverified endpoints) | moderate |
| Event reminders, add to calendar | web feature | moderate |
| Activity: comment, rate up, open the item in-app | `Community.GetCommentThread`, `PostCommentToThread` | moderate |
| Upcoming events calendar (Next Fest, themed fests) | the sale events endpoint covers live ones only | moderate |

## Account and app shell

| Feature | Steam has it in | Notes | Effort |
|---|---|---|---|
| Deep links (`s.team/chat`, store URLs into the app) | Steam apps | no `scheme`, no URL handler | easy |
| Wallet balance | Steam Mobile, web | `GetWalletDetails` (unverified) | easy |
| Accessibility labels on cards, avatars, gauges, badges; dynamic type | — | partial today | easy |
| Caching for guests | — | the cache is per account, so guest lists reload every launch | easy |
| Multiple accounts | Steam Mobile, desktop | the token store holds one | moderate |
| Language setting / localized UI | all apps | UI is English; `client_language: 'english'` at logon (`vaporchat/steam/logOn.ts`) | moderate |
| Points balance, Points Shop | web, Steam Mobile web view | `LoyaltyRewards.GetSummary`, `QueryRewardItems` | moderate |
| Steam Replay / Year in Review | web | `SaleFeature.GetUserYearInReview` | moderate |
| Family: members, purchase requests, playtime limits | Steam Mobile, client, web | `FamilyGroups.*` | moderate |
| Authorized devices, sign out other sessions | Steam Mobile, web | `Authentication.EnumerateTokens`, `RevokeRefreshToken` (unverified) | moderate |
| Privacy settings, profile editing | web | web pages | moderate |

## Community

Web-only on Steam (reachable through Steam Mobile's web views), and probably out of scope for a
chat-and-store app; opening the web page from the game page is the cheap route.

| Feature | API | Effort |
|---|---|---|
| Guides, Workshop, screenshots, artwork, videos | `PublishedFile.QueryFiles` / `GetDetails` / `Vote` / `Subscribe` (key or token) | moderate |
| Groups: announcements, events, members (legacy community groups, not chat groups) | — | moderate |
| Badges, trading cards, levels | `GetBadges` (key or token) | moderate |
| Community awards on reviews and posts | `LoyaltyRewards.AddReaction` | moderate |
| Discussions | only `Forums.GetTopicDetails` exists; topic lists are HTML | hard |
| Broadcasts | watching needs Steam's broadcast player | hard |
