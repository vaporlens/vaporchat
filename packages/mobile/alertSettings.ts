import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { canStayConnected, setStayConnected } from './modules/call-service';

const MUTED_KEY = 'muted-friends';
const STAY_KEY = 'stay-connected';

/**
 * Friends whose messages don't alert, kept on this device (Steam has no such setting to sync),
 * and muting or unmuting one.
 */
export function useMutedFriends(onError: (err: Error) => void) {
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    SecureStore.getItemAsync(MUTED_KEY)
      .then((saved) => {
        if (saved) setMuted(new Set(JSON.parse(saved) as string[]));
      })
      .catch(onError);
  }, [onError]);

  const toggle = useCallback(
    (steamid: string) => {
      const next = new Set(muted);
      if (!next.delete(steamid)) next.add(steamid);
      setMuted(next);
      SecureStore.setItemAsync(MUTED_KEY, JSON.stringify([...next])).catch(
        onError,
      );
    },
    [muted, onError],
  );

  return { muted, toggle };
}

/** On signing out, the next account has friends of its own. */
export function clearMutedFriends() {
  return SecureStore.deleteItemAsync(MUTED_KEY);
}

/**
 * Whether the app stays connected to Steam in the background (Android), set while signed in. Off
 * until turned on, it costs battery.
 */
export function useStayConnected(onError: (err: Error) => void) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(STAY_KEY)
      .then((saved) => setOn(saved === 'on'))
      .catch(onError);
  }, [onError]);

  useEffect(() => {
    setStayConnected(on);
    return () => setStayConnected(false);
  }, [on]);

  const change = useCallback(
    (next: boolean) => {
      setOn(next);
      SecureStore.setItemAsync(STAY_KEY, next ? 'on' : 'off').catch(onError);
    },
    [onError],
  );

  return { available: canStayConnected, on, change };
}
