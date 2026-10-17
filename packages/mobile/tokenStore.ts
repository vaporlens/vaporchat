import * as SecureStore from 'expo-secure-store';
import { randomLogonId, type TokenStore } from 'vaporchat/steam/logOn';

const KEY = 'steam-refresh-token';
const LOGON_ID_KEY = 'steam-logon-id';

/** The Steam refresh token, in the iOS keychain / Android keystore. */
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
