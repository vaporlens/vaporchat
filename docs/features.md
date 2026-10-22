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

Friend rows with avatar, name, online/offline, an unread badge and a call button; offline friends
collapsed; search by name (`mobile/screens/Rows.tsx`, `mobile/screens/Home.tsx`).

- **"Playing X"** in Steam's in-game green: `CMsgClientPersonaState.Friend` `game_played_app_id`
  and `gameid`. `game_name` comes only for non-Steam games, so Steam games are named via the store.
- **Away / Snooze:** `persona_state` 3 and 4.
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
  Notifications show a spoiler as "Spoiler". Typing `/` first lists those four commands to pick from; they're sent as typed and
  Steam turns them into the BBCode, like `/sticker`;
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
deafen and a speaker toggle whose other side is a connected headset or the earpiece (speaker off
by default with a headset); speaking indicators; reconnect with backoff; an Android foreground
service and iOS background audio.

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

**Game page:** price/discount/ownership header, "Open in Steam", review summary, Overview (Early
Access notice, description, facts, editions, tags, features, links, VaporLens), Media, About
(Early Access answers, description, system requirements), DLC, Reviews, News, More like this.

- editions and bundles that include it, each priced: `GetItems` `include_all_purchase_options`;
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
  from `Store.GetUserGameInterestState` over the CM. A change reloads the Wishlist tab.

**Lists:** Store (discounted, top sellers, Wishlist, My games), Releases and name search.
**My games** cards show total playtime in the picture's badge and recent playtime or last played
under the name (`GetOwnedGames` `playtime_forever`, `playtime_2weeks`, `rtime_last_played`).

Sale pages show the event's summary and its games, bundle pages the bundle's games, article
pages the article.

## Feed

News ("Your News" sources, featured when signed out), friends' Activity (10 kinds), live sale
Events.

## Account and app shell

Settings: status picker, "Stay connected" (Android) and sign-out. Region and currency follow
Steam's geolocation; VaporLens prices are always USD.

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
