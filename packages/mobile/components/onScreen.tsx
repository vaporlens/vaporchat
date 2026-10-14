import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Dimensions, type View } from 'react-native';

/** Told on every scroll, and once more `settled` when scrolling pauses. */
type Listener = (settled: boolean) => void;

interface ScrollWatch {
  listeners: Set<Listener>;
  /** tells the listeners `settled` unless scrolling goes on first */
  settleSoon: () => void;
}

/** The scroll view around's watch. */
const ScrollWatchContext = createContext<ScrollWatch | null>(null);

// scroll events come every 100ms while it moves, this long without one and it has paused
const SCROLL_PAUSE_MS = 300;

/**
 * For a scroll view whose content asks `useOnScreen`: wrap the content in `Provider` with `watch`
 * and pass `onScroll` with a `scrollEventThrottle` of 100.
 */
export function useScrollWatch() {
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [watch] = useState<ScrollWatch>(() => {
    const listeners = new Set<Listener>();
    const settle = () => {
      for (const listener of listeners) listener(true);
    };
    return {
      listeners,
      settleSoon() {
        clearTimeout(pause.current);
        pause.current = setTimeout(settle, SCROLL_PAUSE_MS);
      },
    };
  });
  useEffect(() => () => clearTimeout(pause.current), []);
  const onScroll = useCallback(() => {
    for (const listener of watch.listeners) listener(false);
    watch.settleSoon();
  }, [watch]);
  return { watch, onScroll, Provider: ScrollWatchContext.Provider };
}

/**
 * Tells whether the view is within the screen as the scroll view around scrolls, and on layout:
 * pass the returned check as its `onLayout`. `settled` once scrolling pauses, work too heavy to
 * do mid-scroll waits for it. Nothing to check outside a watched scroll view.
 */
export function useOnScreen(
  ref: RefObject<View | null>,
  onChange: (visible: boolean, settled: boolean) => void,
) {
  const watch = useContext(ScrollWatchContext);

  const check = useCallback(
    (settled: boolean) => {
      ref.current?.measureInWindow((_x, y, _width, height) => {
        onChange(
          y < Dimensions.get('window').height && y + height > 0,
          settled,
        );
      });
    },
    [ref, onChange],
  );

  useEffect(() => {
    if (!watch) return;
    watch.listeners.add(check);
    return () => {
      watch.listeners.delete(check);
    };
  }, [watch, check]);

  const onLayout = useCallback(() => {
    check(false);
    watch?.settleSoon();
  }, [watch, check]);
  return watch ? onLayout : undefined;
}
