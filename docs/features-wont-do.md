# Features: won't do

Gaps against Steam's own apps that stay open on purpose. Leave these out of plans and
suggestions; reopening one is the user's call. Open gaps are in
[`features-pending.md`](features-pending.md), what the app has in [`features.md`](features.md).

## Decided

The user decided against these; the notes keep the API found, in case a decision changes.

| Feature | Notes |
|---|---|
| Rich presence ("Ranked match, 3-1") | `rich_presence` in `CMsgClientPersonaState.Friend`; `Community.GetAppRichPresenceLocalization` turns tokens into text |
| Mobile/web/Big Picture badge on friends | `persona_state_flags` (512 mobile, 256 web, 1024 tenfoot) |
| "Last online N ago" for offline friends | `last_logoff` comes only in pushes for online friends; offline ones need the LastSeen flag (64), untested for the persona-state gotcha (`features.md`) |
| Friend management: incoming and outgoing requests, accept, ignore, add, add by friend code, invite links, remove, block, nicknames, mutual friends | relationships 2 and 4 in `CMsgClientFriendsList`; `Player.AddFriend`, `RemoveFriend`, `IgnoreFriend`; `UserAccount.CreateFriendInviteToken`; `Player.GetNicknameList`, EMsg 5588; `Player.GetMutualFriendsForIncomingInvites` |
| Steam texts in the device language (reviews, news, tags, categories, search, activity, logon) | fixed to English everywhere (`context()` in `vaporchat/steam/store.ts`); `vaporchat/steam/language.ts` maps the locale and is used only for sale pages |
| Game page: supported languages, age rating, Steam awards, anti-cheat, AI-content disclosure, review-bomb notice, recent and per-language review scores, achievements count, Metacritic, friends who play, your playtime and achievements, curator reviews, demos, community hub links, more than 12 tags and tag voting, accessibility and controller detail | mostly `GetItems` / `include_extra_details` fields and `appreviews` parameters |
| Add to cart | purchases stay in Steam ("Open in Steam") |
| Wishlist sorting | `GetWishlistSortedFiltered` `sort_order`, fixed to discount |
| Reviews tab: filters, funny votes and free / Early Access / Steam-purchase labels, the author's total playtime, developer responses | `appreviews` `review_type`, `filter`, `day_range`, `purchase_type`; the labels and `author.playtime_forever` are in the response (`vaporchat/steam/reviews.ts`); `developer_response` (unverified field name) |
| Sale page: the event's full body | only `summary` is shown (`mobile/screens/SaleScreen.tsx`) |
| Hide a notification | `HideNotification` |
| Wallet balance | `GetWalletDetails` (unverified) |
| Deep links (`s.team/chat`, store URLs into the app) | they'd clash with the official apps over Steam's links; iOS can't claim Steam's domains anyway |
| Group management: create, invite friends, invite links, leave, rename, tagline, avatar | the aim is using chat, not managing it; `CreateChatRoomGroup`, `InviteFriendToChatRoomGroup`, `CreateInviteLink`, `LeaveChatRoomGroup`, `RenameChatRoomGroup` |
| Moderation: delete messages, kick, ban | same aim; `ChatRoom.DeleteChatMessages` (rooms only, no 1:1 delete exists), kick/ban methods |
| Chat filtering, suspicious-link warnings, reporting a message | account setting and client-side filtering, web report (unverified) |
| Game invites, Remote Play Together invites | entry types and RPT signalling (unverified) |
| Friends: favorites and custom categories, profiles, reporting a user | `FriendsList.GetCategories/GetFavorites/SetFavorites`; `Player.GetPlayerLinkDetails`, `GetProfileItemsEquipped`, `GetProfileCustomization` (token, JSON); report is a web form (unverified) |
| Push-to-talk, voice activity threshold | no point on a phone |
| Writing or editing your own review | web form (unverified) |
| Voting reviews helpful or funny, awarding and commenting on them | web forms; `LoyaltyRewards.AddReaction` for awards |
| Store search filters and sorting, suggestions while typing | search is name-only (within the hub or tag on their pages) and waits 3.5 s idle (`mobile/screens/Feed.tsx`); Steam has price, tags, features, platform, language and Deck filters |
| Discovery Queue, personalised store home (Featured & Recommended, wishlist-on-sale, DLC for your games) | `Store.GetDiscoveryQueue`, `SkipDiscoveryQueueItem` (token); `IStoreMarketingService`, `GetDLCForApps` |
| Charts, curators, store preferences (ignored games, excluded tags, mature content), recommenders | store charts and curator endpoints (unverified); `Store.GetStorePreferences`, `StorePreferences.GetIgnoreList`, `apply_user_filters` on `GetItems` |
| Wishlist reordering | `Wishlist` service writes (POST) |
| Library collections and game notes | the client's cloud storage (unverified) |
| Sale page tabs, trailers, dynamic sections | dropped on purpose (`vaporchat/steam/salePage.ts`) |
| Bundle discount explanation, "complete the set" price | `GetItems` purchase options |
| Rating up an article | `Community.RateClanAnnouncement`; the count and comments show read-only, see `features.md` |
| Feed: follow news curators, event reminders, activity comments, rate-up and opening the item in-app, upcoming-events calendar | News Hub settings (unverified); `Community.GetCommentThread`, `PostCommentToThread`; the sale events endpoint covers live ones only |
| Localized UI | UI is English; `client_language: 'english'` at logon (`vaporchat/steam/logOn.ts`) |
| Points, Steam Replay, Family (members, purchase requests, playtime limits) | `LoyaltyRewards.GetSummary`, `QueryRewardItems`; `SaleFeature.GetUserYearInReview`; `FamilyGroups.*` |
| Authorized devices, privacy settings, profile editing | `Authentication.EnumerateTokens`, `RevokeRefreshToken` (unverified); web pages |
| Community: guides, Workshop, screenshots, legacy groups, badges, awards, discussions, broadcasts | `PublishedFile.*`, `GetBadges` (key or token), `LoyaltyRewards.AddReaction`; discussions are HTML only (`Forums.GetTopicDetails` exists); broadcasts need Steam's player |
| Buttons on list cards (remove from wishlist and the like) | — |
| My games: sort and filter, achievement progress and lists, remote install / launch / download status | `Player.GetAchievementsProgress` (POST); `ClientComm.*` (token, not in steam-user's protos) |
| QR-code sign-in | `Authentication.BeginAuthSessionViaQR`, approved in Steam Mobile |
| Presence and unread in the web client | `packages/web` is a test harness |

## Not possible

| Feature | Why |
|---|---|
| Busy / Do Not Disturb for friends | Busy (`persona_state` 2) is left from the pre-2018 friends list; today's clients can't set it. Do Not Disturb stays on the user's own client: toggling it sends friends nothing (tested) |
| Steam Guard authenticator codes | need the account's `shared_secret`, which only the authenticator device holds. Taking it over (`TwoFactor.AddAuthenticator`) moves the user's 2FA off the official app |
| Approving sign-ins or QR codes for the user | signed with the same `shared_secret` |
| Trade and market confirmations | signed with `identity_secret`, also authenticator-only; so selling, and trades that give items away, are out too |
| In-app checkout | no API; Steam's web checkout handles payment and 3-D Secure, and app-store rules restrict digital purchases. "Open in Steam" is the route |
| Push and ringing while the app is closed or the screen is locked | Valve's push goes only to Valve's apps (APNs/FCM are per app). The only way is our own server holding a CM session per user with their refresh token, sending VoIP push (CallKit / ConnectionService) and our own notifications: a big security and privacy step against the "no server" decision in `docs/handoff.md` |
| Remote Play / streaming | separate Steam Link protocol and app |
| Game recording, overlay, performance monitor, Steam Input | PC client features |
