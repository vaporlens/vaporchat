import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import type { CacheStore } from 'vaporchat/steam/cacheStore';

// the system may empty it when storage runs low, everything in it gets loaded again anyway
const directory = new Directory(Paths.cache, 'steam');
/** the signed-in account's SteamID64, the app's entries are its */
let account: string | null = null;

function file(name: string) {
  // keys hold ids and `:`, file names keep to plain characters
  return new File(directory, `${name.replace(/[^\w-]/g, '_')}.json`);
}

function readText(name: string) {
  try {
    const saved = file(name);
    return saved.exists ? saved.textSync() : null;
  } catch {
    return null;
  }
}

function writeText(name: string, text: string) {
  // loads finishing after signing out are dropped
  if (!account) return;
  try {
    file(name).write(text);
  } catch (err) {
    console.warn(`Caching ${name} failed:`, (err as Error).message);
  }
}

/** The app's entries are this account's from now on. */
export function openCache(steamid: string) {
  account = steamid;
  directory.create({ idempotent: true, intermediates: true });
}

/** On signing out: forgets every account's chats and friends. */
export function clearCache() {
  account = null;
  if (directory.exists) directory.delete();
}

/** What was saved under `key` last time, null when nothing was (or it can't be read). */
export function readCache<T>(key: string): T | null {
  const text = account && readText(`${account}-${key}`);
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** Saves `value` (JSON) to show next time before it loads. */
export function writeCache<T>(key: string, value: T) {
  writeText(`${account}-${key}`, JSON.stringify(value));
}

/** The library's cache (Steam's servers, friends list), its keys name the account themselves. */
export const cacheStore: CacheStore = {
  load: async (key) => readText(key),
  save: async (key, value) => writeText(key, value),
};

/**
 * What `load` gets, shown from last time's cache until it arrives and saved for next time.
 * Loads again when `key` or `load` changes. `error` is the last failed load's, `reload` rejects.
 */
export function useCached<T>(key: string, load: () => Promise<T>) {
  const [entry, setEntry] = useState(() => ({
    key,
    data: readCache<T>(key),
    error: null as string | null,
  }));
  // a screen reused for another game starts from that one's cache
  if (entry.key !== key) {
    setEntry({ key, data: readCache<T>(key), error: null });
  }

  // results for a key left meanwhile are only cached
  const reload = useCallback(
    () =>
      load().then((data) => {
        writeCache(key, data);
        setEntry((shown) =>
          shown.key === key ? { key, data, error: null } : shown,
        );
      }),
    [key, load],
  );

  useEffect(() => {
    reload().catch((err: Error) =>
      setEntry((shown) =>
        shown.key === key ? { ...shown, error: err.message } : shown,
      ),
    );
  }, [key, reload]);

  return { data: entry.data, error: entry.error, reload };
}
