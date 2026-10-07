import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/**
 * Android's back button and gesture: `onBack` returns true when it went back, false lets the
 * system have it (leaving the app). The last one mounted is asked first, so it registers once.
 */
export function useBackHandler(onBack: () => boolean) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      latest.current(),
    );
    return () => subscription.remove();
  }, []);
}
