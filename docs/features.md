# Features: what Vaporlens has

What the app does today, by area, with the Steam API behind each feature and the gotchas found
while building it. Paths are relative to `packages/`. What is tested where lives in the
"Verification status" table of `vaporchat/README.md`. Gaps are in
[`features-pending.md`](features-pending.md), decided gaps in
[`features-wont-do.md`](features-wont-do.md).

Vaporlens is ahead of Valve in one place: no official mobile app has voice chat. Steam Chat (last
iOS update 2021) never shipped voice, and Steam Mobile has store, library and security but no
chat at all.

## Friends and presence

Friend rows with avatar, name, online/offline, an unread badge and a call button; friends in a game
grouped under it like Steam's "group friends by game", games most friends play first, a Steam
game's header opening its game page; groups and friends with unread messages in an Unread section
on top; offline friends collapsed; search by name or nickname (`mobile/screens/Rows.tsx`,
`mobile/screens/Home.tsx`).

- **"Playing X"** in Steam's in-game green: `CMsgClientPersonaState.Friend` `game_played_app_id`
  and `gameid`. `game_name` comes only for non-Steam games, so Steam games are named via the store.
- **Away / Snooze:** `persona_state` 3 and 4.
- **Nicknames** the user gave friends, after their name in friend rows and the chat title:
  `CMsgClientPlayerNicknameList` (EMsg 5587) after logon, `PlayerClient.NotifyFriendNicknameChanged`
  when changed elsewhere.
- **Own status** (Online, Away, Invisible): `ClientChangeStatus` (1, 3, 7) on every connect and
  when picked in Settings, kept on the device until sign-out. Status is account-wide, so it
  overrides one set elsewhere.

**The persona-state gotcha.** Asking Steam for friends' Status flag made Steam answer every
session of the account with everyone offline, which signed the official clients out of chat
(`vaporchat/steam/friends.ts`, CHANGELOG 0.2). So friends start offline until Steam pushes their
state. Anything that asks Steam for others' status must first be tested for this side effect;
`Chat.RequestFriendPersonaStates` and `Player.GetPlayerLinkDetails` (WebAPI, no CM broadcast) are
untested candidates.

## Chat

1:1 and group room chat with history paging (`mobile/screens/Chat.tsx`,
`vaporchat/steam/messages.ts`):

- emoticons, animated stickers, images with a full-screen viewer, sending photos from the library
  or the camera (a popup points to Settings while camera access is off), an emoticon/sticker
  picker;
- **tappable links:** `[url]` BBCode and typed `http(s)` links, web pages only;
- **formatting:** `[quote]`, `[spoiler]` (covered until tapped, then its links open), `[code]`
  and `[pre]` (both monospaced), what the desktop client's `/quote`, `/spoiler`, `/code` and
  `/pre` send. A quote ends at its first `[/quote]`, so quotes in quotes aren't nested.
  Notifications show a spoiler as "Spoiler". Typing `/` first lists those four commands and
  `/store` to pick from; they're sent as typed and Steam turns them into the BBCode, like
  `/sticker`;
- **@mentions:** `[mention=<account id>]@Name[/mention]`, `[mention=all]` and `here` for
  everyone; gold when it's us or everyone. Typing `@` in a room suggests its members and @all /
  @here, picking one sends that BBCode (`withMentions` in `vaporchat/steam/bbcode.ts`). Steam
  fills the message's `mentions` itself;
- **link previews:** Steam rewrites a sent link (`SendMessage` answers with `modified_message`).
  A store page becomes `[steamstore app="…"]link[/steamstore]`, shown as the game's card that
  opens its page here (`mobile/screens/LinkPreviews.tsx`). Web pages (`[og url img title desc]`)
  and YouTube (`[youtube v t]`) show as cards too; those two tags come from Steam's chat JS and
  weren't seen in a real message yet;
- **`/store` name** suggests the store's games as you type (the name search) and sends the picked
  one's store link, which Steam turns into a store card, like the desktop client;
- **spoiler photos:** after picking or taking a photo, Send / As spoiler / Cancel. "As spoiler"
  commits the upload with `spoiler=1` (`vaporchat/steam/imageUpload.ts`), and Steam posts it as
  `[spoiler][img …][/img][/spoiler]`; incoming ones are blurred until tapped;
- **date separators** (Today, Yesterday, then the date) and **search** of the loaded messages
  (header button, matches the text notifications show: text, links, code and quotes, and
  "Image", "Sticker" or "Spoiler" for those);
- **reactions:** `FriendMessages.UpdateMessageReaction`, `ChatRoom.UpdateMessageReaction`, pushed
  back as `MessageReaction` / `NotifyMessageReaction`. Emoticons go as `:name:` (Steam denies them
  otherwise), stickers by name. Hold a message to react, tap a reaction to toggle ours;
- **typing notices:** `SendMessage` with `chat_entry_type=2` every 5 s while typing, "typing…" in
  the header for 8 s per notice. Friends only, rooms have none;
- **room switcher:** a group opens its first text room; pills over its chat switch to any room,
  voice channels' text too. The group's dot counts all its rooms, each pill has its own;
- **member list:** from the group state (big groups: top members only), status for friends and
  you only (others' status is the persona-state gotcha above). Roles not shown;
- echo merge of our own messages sent from other devices.

**Unread state synced with Steam, surviving restarts.** Counts for friends from
`FriendMessages.GetActiveMessageSessions`; a dot for rooms from `CUserChatRoomState.time_last_ack`
vs `time_last_message`; a dot on the Chat tab while any chat is unread. Rooms with the unread
indicator muted (room or group `unread_indicator_muted`, as at logon) are never unread. Chats on
screen are marked read on Steam (`FriendMessages.AckMessage`, `ChatRoom.AckChatMessage`), which
clears desktop badges too; reads elsewhere come back as `NotifyAckMessageEcho`.

## Voice

Group voice channels and 1:1 calls (place, accept, decline, simultaneous-call takeover); mute,
deafen; speaking indicators; reconnect with backoff; an Android foreground service, its
notification with a Leave button, and iOS background audio.

- **Where it plays:** speaker, earpiece, or a wired, USB or Bluetooth headset
  (`mobile/modules/audio-route` `outputs` / `setOutput`; Android's communication devices, iOS's
  audio session inputs). A headset when one is connected, else the speaker. One connecting
  mid-call takes over like in phone calls; when the one playing goes, another headset or the
  speaker does (`useVoice` in `mobile/voice.ts`). With two outputs the button swaps them, with
  more it opens a picker. iOS lists Bluetooth headsets only once voice is on.
- **Someone's volume here:** tapping a participant sets 25–200% or mutes them for us only, they
  aren't told (react-native-webrtc's `MediaStreamTrack._setVolume`, gain 0–10). Kept per person
  while the app runs.
- **Listen-only voice** (microphone permission denied or busy at joining) has "Use mic" in place
  of Mute: it takes the microphone (`VoiceSession.setMicrophone`, which reconnects to send) or
  points to Settings, and moves the Android service to the microphone type.
- **Several calls at once:** the first rings full screen, the others as chips under it; tapping
  one brings that call forward.

**Incoming calls** ring with the phone's ringtone on Android and a bundled ring on iOS
(`mobile/modules/audio-route`). During voice they beep the phone's call waiting tone instead,
without vibration.

## Notifications

Alerts for messages and incoming calls while the app is in the background (`mobile/alerts.ts`):
friends unless muted on the device, groups by Steam's per-group mobile level. One per chat with
its latest message, gone once the chat is read here or elsewhere; tapping one opens its chat.

- **Staying alive:** Android freezes background apps. "Stay connected" (Settings, Android, off by
  default) runs a foreground service plus a never-ending headless JS task, because React Native
  pauses timers, and with them Steam's heartbeat, in the background otherwise. Without it alerts
  come during calls and in the seconds before Android freezes the app. iOS suspends the app, so
  there alerts only come during calls.
- **Per-chat settings** live in each chat's header. Groups: `ChatRoom.SetUserChatGroupPreferences`
  `mobile_notification_level` (all, mentions, none). Unset reads as mentions, since Steam's default
  lives in the desktop client's settings. Friends: a mute kept on the device.
- **Steam notification inbox** behind a bell with an unread count
  (`vaporchat/steam/steamNotifications.ts`): `SteamNotification.GetSteamNotifications` over the
  CM, its methods copied into `vaporchat/scripts/steamNotification.proto`. Titles per type,
  wishlist games named; bodies only say what a notice is about, so comments and items show a
  generic line. `SteamNotificationClient.NotificationsReceived` reloads the list;
  `MarkNotificationsRead` marks all read when the inbox opens.

## Store pages and lists

**Game page:** price/discount header, "Open in Steam", sharing its store link, review summary
of all languages and purchases, off-topic ones too (`IUserReviewsService/GetAppReviews`
`return_query_summary`, `filter_offtopic_activity: 0`; `GetItems` counts only Steam purchasers
for paid games), "No reviews" or a bare count when too few to rate, players now
(`ISteamUserStats/GetNumberOfCurrentPlayers`, keyless; 404 for games without a count; not
asked for DLC, `GetItems` `type` 4, which it counts as 0),
Overview (Early Access notice, description, facts, tags, features, links, VaporLens), Media, About
(Early Access answers, description, system requirements), DLC & editions, Reviews, News, More like
this.

- **reviews:** English ones, most helpful first like the store page, paged by cursor
  (`IUserReviewsService/GetAppReviews`, keyless; it replaced `appreviews`, switched off on 22 Oct
  2026); authors' names and pictures from their profiles, like comments;
- **reviews over time** above the reviews: recommended up, not recommended down, a bar per month
  since release (per week for young games) or per day for the last 30 days, grouped to fit; tap a
  bar for its counts (`store.steampowered.com/appreviewhistogram/{appid}`, `rollups` and
  `recent`). Colors `chartPositive` / `chartNegative` in `mobile/theme.ts`, checked for color
  blindness against the card surface;
- **VaporLens, signed in:** "Your fit" first among the analysis' gauges, like vaporlens.app's "Your
  fit": on the scans' scale, tapping it says "N% similar to what you play", or asks to log in and
  import the library; on games VaporLens hasn't analyzed, "Request
  analysis", which adds the game to its queue or votes for it (`/api/mobile/fit`, `/api/mobile/queue`);
  on reports a week old or more, "Request update", confirmed first like on vaporlens.app, queues a
  new analysis (`PUT /api/mobile/queue`);
- **ProtonDB**, off until turned on in Settings ("Show ProtonDB rating", kept on the device): a
  fact row with the tier, the trending tier when it differs, and the report count, opening the game
  on protondb.com (`www.protondb.com/api/v1/reports/summaries/{appid}.json`, undocumented, keyless;
  404 for games without reports; its CORS allows only protondb.com, so web would need a proxy);
- **More like this:** the games VaporLens reads alike (the report's `similar`, turned into store
  items with `GetItems`) above Steam's suggestions, which leave those out;
- editions and bundles that include it, above the DLC, each priced and opening as a bundle:
  `GetItems` `include_all_purchase_options` gives their package and bundle ids, `GetItems` on
  those the items (packages' picture is `package_header`);
- links: `GetItems` `include_links`, website from `include_extra_details`;
- Early Access banner and its "why / how long" text: `release.is_early_access`,
  `include_extra_details` → `early_access`;
- DLC: `StoreBrowse.GetDLCForAppsSolr` (anonymous, `count` up to all); if it fails the page shows
  without the DLC tab;
- system requirements per OS: `include_extra_details` → `system_requirements`, structured (older
  games send BBCode, or a store token that is left out);
- more like this: `StoreQuery.MoreLikeThis` (anonymous, returns priced items);
- **wishlist, follow, ignore** and undoing each: the store page's forms
  (`store/api/addtowishlist`, `explore/followgame/`, `recommended/ignorerecommendation/`), state
  from `Store.GetUserGameInterestState` over the CM. Ignore asks for "not interested" or "played
  elsewhere" like the store does (`ignore_reason` 2, read back as `ignored_reason`). A change
  reloads the Wishlist tab. An owned game has a green "In library" in place of the wishlist button.

**Lists:** Store (discounted, top sellers, Wishlist, My games, Browse), Releases and name search.
**My games** cards show total playtime in the picture's badge and recent playtime or last played
under the name (`GetOwnedGames` `playtime_forever`, `playtime_2weeks`, `rtime_last_played`).
Games the user's Steam Family lends them follow, by name, marked "Family shared", without playtime
(`IFamilyGroupsService/GetFamilyGroupForUser`, then `GetSharedLibraryApps` without the user's own
or excluded games).
**Wishlist** cards show the review score and the date added (`date_added` of
`GetWishlistSortedFiltered`, `GetItems` `include_reviews`). The user's wishlist categories show as
pills once they made some (`IWishlistService/GetWishlistCategories`, then
`GetWishlistSortedFiltered` `filters.category_ids`).

**Browse:** hubs (Free to Play, Demos, Early Access, VR, Steam Deck Verified) and the store's tags,
most used first (`IStoreService/GetMostPopularTags`, searched by name in the app),
each opening its games, most popular first: a store search by filter (`tags`, `category1=10`
demos, `vrsupport=402`, `deck_compatibility=3`, `category1=998` for games only;
`vaporchat/steam/store.ts`). A game page's tags open the same lists. Each list's search bar
searches the store within it (the filter plus `term`).

**Hiding the user's games:** Settings' "Hide games in your library" and "Hide wishlisted games"
leave them out of the store's lists, Releases and Browse (not Wishlist, My games or searches),
from the same owned and wishlisted sets that mark the cards; kept on the device.

Sale pages show the event's summary and its games, bundle pages the bundle's games, article
pages the article and a link to its game's page, then how many rated it up and its comments,
newest first, read only (`ICommunityService/GetCommentThread`, POST only, anonymous, thread type
7 for the event's `ForumTopic` `gidfeature`/`gidfeature2`; `vaporchat/steam/comments.ts`).
Comments only carry a steamid, so names and avatars come from each author's
`steamcommunity.com/profiles/{steamid}/?xml=1`, keyless and fine with a hundred at once.
`miniprofile/{accountid}/json` answers 500 after about 16 at once, for about 45 seconds.
A `[dynamiclink]` to a YouTube video shows its frame like chat's previews, in an article one to a
store page shows the game's card; other links stay links. Links typed into the text are tappable.

## Feed

News ("Your News" sources, asked for by `appTypes=library,wishlist,following,steam`; featured
when signed out), friends' Activity (10 kinds; the first
three achievements unlocked named and described, the rest as icons), live sale Events.

**Muting a game's or group's news** from its article page, beside the game's link: the post's
game, or its group when it has none, like the News Hub's menu, through the store form
`account/optoutappcommunication/` (`allowCommunication` 0 or 1, `appId` or `clanId`, the
session's cookie and `sessionid`). The timeline still sends their posts, so News leaves them out
itself: it reads the muted ones from `account/emailoptout/app` (`g_appidToName`,
`g_clanidToName`; the News Hub's "Manage muted sources", `vaporchat/steam/newsMutes.ts`). A muted
post stays in the feed until it reloads.

## Account and app shell

Settings: status picker, "Stay connected" (Android), games hidden in the store, ProtonDB on game
pages, VaporLens imports,
accounts and sign-out. Region and currency follow Steam's geolocation; VaporLens prices are
always USD.

**Signed in to vaporlens.app automatically through Steam OpenID; the Steam token never leaves for
vaporlens.** The app signs in on Steam's OpenID page with its web session, posts the sign-in form
back like the "Sign In" button, and hands vaporlens.app only Steam's signed redirect, fetched
without Steam's cookie (`vaporchat/steam/openId.ts`). The session token lives in SecureStore
next to the Steam token, is renewed a day before it expires, and is dropped on sign-out and when
switching accounts. Settings' VaporLens section imports the library (which makes the taste
profile behind the fit score) and the wishlist; vaporlens.app fetches them from Steam itself, so
the profile has to be public.

**Several accounts:** Settings' "Add account" and each other account's "Switch". The open
account's token stays where it was; the others are put aside in the keychain under their
SteamID64 with their name, avatar and status (`mobile/tokenStore.ts`). Switching leaves voice,
puts the open one aside and opens the other with its own status; cancelling the sign-in of a new
one opens the last one again; signing out, or launching with none open, opens the next one put
aside. Sign-out still clears every account's cache and friend mutes, and the open one's status.

Signed out, the store's lists are cached as a guest's, cleared with the rest at sign-out. A load
still running when the account changes isn't cached (`cacheWriter` in `mobile/cache.ts`), so the
guest never gets the account's lists. Screen readers get labels on cards (name first), rows,
pills, gauges and the call dock; avatars are skipped, as a name is always next to them. Text
follows the system font size; checked up to Android's largest, where voice channels go one per
row (`mobile/screens/VoiceChannels.tsx`).

**One logon id per install.** Each connection used to log on with a new random
`obfuscated_private_ip`, so a reload or relaunch couldn't replace its earlier session; they piled
up until Steam refused logons with EResult 50 (AlreadyLoggedInElsewhere). The app keeps one per
install (`deviceLogonId`), the library one per process.

## Known limits

- Switching voice while a call rings can play the ringtone for up to a second: leaving the old
  chat reports "no voice" before the new one starts (`vaporchat/client/steamVoice.ts` `#start`).
  Fixing it also changes the audio-route reset and the service stop on every switch; undecided.
- Discounted list paging is approximate: `GetItemsToFeature` has no offset, so pages can repeat
  or skip (`vaporchat/steam/store.ts`).
- Game news cards show no game name (`game: null` in `vaporchat/steam/events.ts`), fine inside a
  game page.
- Friends' activity leaves out status changes and group announcements on purpose
  (`vaporchat/steam/friendsActivity.ts`).
- The web client (`packages/web`) is a test harness: no presence, no unread.
- Family shared games are built from SteamDatabase's protos, untested against a family: the test
  account is in none.
- Wishlist categories are untested with categories: the test account has none.
- The audio output picker and headset switching are untested on a phone: the emulator has only
  its speaker.
