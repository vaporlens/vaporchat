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

## Store pages and lists

### Wishlist

| Feature | API | Effort |
|---|---|---|
| Share link for a private wishlist | the store's share token: a "server action" `CreateWishlistShareToken(filters)`, POSTed to the wishlist page with `x-valve-request-type: routeAction` and `x-valve-action-type: <route id>:CreateWishlistShareToken`, the route id hashed into its JS bundle and changing with Steam's deploys (unverified, a write); `RevokeWishlistShareTokens` | hard |
