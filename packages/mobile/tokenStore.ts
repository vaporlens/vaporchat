import * as SecureStore from 'expo-secure-store';
import type { MyStatus } from 'vaporchat/protocol';
import { randomLogonId, type TokenStore } from 'vaporchat/steam/logOn';

const KEY = 'steam-refresh-token';
const LOGON_ID_KEY = 'steam-logon-id';
// the other accounts signed in on this device, their tokens each under `${KEY}-${steamid}`
const ACCOUNTS_KEY = 'steam-accounts';

/** An account signed in on this device besides the open one, to switch to. */
export interface SavedAccount {
  steamid: string;
  name: string;
  avatarUrl: string | null;
  /** what friends saw of it, it signs in with that again */
  status: MyStatus;
}

/** The open account's Steam refresh token, in the iOS keychain / Android keystore. */
export const tokenStore: TokenStore = {
  load: () => SecureStore.getItemAsync(KEY),
  save: (refreshToken) => SecureStore.setItemAsync(KEY, refreshToken),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

/** This install's `logonId`, made once and kept like the token, the cache may be emptied. */
export async function deviceLogonId() {
  const saved = Number(await SecureStore.getItemAsync(LOGON_ID_KEY));
  if (saved) return saved;
  const id = randomLogonId();
  await SecureStore.setItemAsync(LOGON_ID_KEY, String(id));
  return id;
}

/** The accounts put aside, to switch to. */
export async function savedAccounts(): Promise<SavedAccount[]> {
  return JSON.parse((await SecureStore.getItemAsync(ACCOUNTS_KEY)) ?? '[]');
}

/** Drops a put-aside account, the open one stays. */
export async function forgetAccount(steamid: string) {
  await SecureStore.deleteItemAsync(`${KEY}-${steamid}`);
  const others = (await savedAccounts()).filter((a) => a.steamid !== steamid);
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(others));
}

/** Puts the open account aside to switch back to, none is open then. */
export async function parkAccount(account: SavedAccount) {
  const token = await tokenStore.load();
  if (!token) return;
  await forgetAccount(account.steamid);
  await SecureStore.setItemAsync(`${KEY}-${account.steamid}`, token);
  await SecureStore.setItemAsync(
    ACCOUNTS_KEY,
    JSON.stringify([...(await savedAccounts()), account]),
  );
  await tokenStore.clear();
}

/** Opens a put-aside account, false when its token is gone. */
export async function unparkAccount(steamid: string) {
  const token = await SecureStore.getItemAsync(`${KEY}-${steamid}`);
  await forgetAccount(steamid);
  if (token) await tokenStore.save(token);
  return token !== null;
}
