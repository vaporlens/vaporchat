/**
 * Keeps data that rarely changes (Steam's servers, the friends list) between app starts, so it
 * can be shown before Steam answers. Anything that stores strings works, a file or localStorage.
 */
export interface CacheStore {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
}

/** What was saved under `key`, null when nothing was or it can't be read. */
export async function loadCached<T>(cache: CacheStore, key: string) {
  try {
    const saved = await cache.load(key);
    return saved ? (JSON.parse(saved) as T) : null;
  } catch {
    return null;
  }
}

/** Saves `value` as JSON, failing only costs the next start its head start. */
export function saveCached<T>(cache: CacheStore, key: string, value: T) {
  cache.save(key, JSON.stringify(value)).catch((err: Error) => {
    console.warn(`Caching ${key} failed:`, err.message);
  });
}
