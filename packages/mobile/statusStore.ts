import * as SecureStore from 'expo-secure-store';
import type { MyStatus } from 'vaporchat/protocol';

const KEY = 'steam-status';
const STATUSES: MyStatus[] = ['online', 'away', 'invisible'];

/** The status picked in Settings, online until one is. */
export async function loadStatus(): Promise<MyStatus> {
  const saved = await SecureStore.getItemAsync(KEY);
  return STATUSES.find((status) => status === saved) ?? 'online';
}

export function saveStatus(status: MyStatus) {
  return SecureStore.setItemAsync(KEY, status);
}

export function clearStatus() {
  return SecureStore.deleteItemAsync(KEY);
}
