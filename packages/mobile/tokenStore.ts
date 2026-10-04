import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from 'vaporchat/steam/logOn';

const KEY = 'steam-refresh-token';

/** The Steam refresh token, in the iOS keychain / Android keystore. */
export const tokenStore: TokenStore = {
  load: () => SecureStore.getItemAsync(KEY),
  save: (refreshToken) => SecureStore.setItemAsync(KEY, refreshToken),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
