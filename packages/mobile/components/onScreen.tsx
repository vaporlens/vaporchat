import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Dimensions, type View } from 'react-native';

type Listener = () => void;

/** The listeners of the scroll view around, told on every scroll. */
const ScrollListeners = createContext<Set<Listener> | null>(null);

/**
 * For a scroll view whose content asks `useOnScreen`: wrap the content in `Provider` and pass
 * `onScroll` with a `scrollEventThrottle`.
 */
export function useScrollWatch() {
  const [listeners] = useState(() => new Set<Listener>());
  const onScroll = useCallback(() => {
    for (const listener of listeners) listener();
  }, [listeners]);
  return { listeners, onScroll, Provider: ScrollListeners.Provider };
}

/**
 * Tells whether the view is within the screen as the scroll view around scrolls, and on layout:
 * pass the returned check as its `onLayout`. Nothing to check outside a watched scroll view.
 */
export function useOnScreen(
  ref: RefObject<View | null>,
  onChange: (onScreen: boolean) => void,
) {
  const listeners = useContext(ScrollListeners);

  const check = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => {
      onChange(y < Dimensions.get('window').height && y + height > 0);
    });
  }, [ref, onChange]);

  useEffect(() => {
    if (!listeners) return;
    listeners.add(check);
    return () => {
      listeners.delete(check);
    };
  }, [listeners, check]);

  return listeners ? check : undefined;
}
