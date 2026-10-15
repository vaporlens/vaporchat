import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  TextInput,
} from 'react-native';

// a fling goes on as momentum after the finger lifts, which starts within this
const MOMENTUM_MS = 100;

/** the touch going on: on a bar, or scrolling a list */
let touch = { onBar: false, dragged: false };
const bars = new Set<() => void>();
/** the last list's height, the next mounts as tall to start scrolled past its bar */
let lastHeight = 0;

/** For the app's root view: a tap anywhere but on a bar hides the bars that show. */
export const barTouches = {
  onTouchStart() {
    touch = { onBar: false, dragged: false };
  },
  onTouchEnd() {
    if (touch.onBar || touch.dragged) return;
    for (const hide of bars) hide();
  },
};

/**
 * Keeps a bar of `barHeight` on top of a list's rows scrolled away. Pulled into view from the
 * top, it stays until a scroll or a tap elsewhere, unless `inUse`. Those close its keyboard
 * either way.
 */
export function useHidingBar<T>(barHeight: number, inUse: boolean) {
  const ref = useRef<FlatList<T>>(null);
  const input = useRef<TextInput>(null);
  // the list's, the rows are made taller than it with the bar
  const [height, setHeight] = useState(lastHeight);
  // as they're measured, ahead of renders
  const sizes = useRef({ list: 0, rows: 0, offset: 0 });
  const hidden = useRef(false);
  // mounted scrolled past the bar, the scroll after measuring comes a frame later
  const [startOffset] = useState({ x: 0, y: barHeight });
  const used = useRef(inUse);
  used.current = inUse;
  // the user's scroll: where it started, its end waiting for momentum. Not ones the code makes
  const drag = useRef<{
    from: number | null;
    settle?: ReturnType<typeof setTimeout>;
  }>({ from: null });

  // how far the bar can scroll away. The rows are made taller than the list by its height, but
  // rounding to the screen's pixels can leave them a fraction short
  const hideOffset = useCallback(() => {
    const { list, rows } = sizes.current;
    return list === 0 ? 0 : Math.min(barHeight, rows - list);
  }, [barHeight]);

  const hide = useCallback(() => {
    input.current?.blur();
    if (used.current || sizes.current.offset >= hideOffset()) return;
    ref.current?.scrollToOffset({ offset: hideOffset(), animated: true });
  }, [hideOffset]);

  useEffect(() => {
    bars.add(hide);
    return () => {
      bars.delete(hide);
    };
  }, [hide]);
  useEffect(() => () => clearTimeout(drag.current.settle), []);

  // it can only scroll past the bar once the rows are taller than the list with it. Either can
  // be measured last, rows from the cache are there before the list is
  function hideFirst() {
    if (hidden.current || hideOffset() < barHeight - 1) return;
    hidden.current = true;
    // the rows' new height is only measured yet, scrolling now would stop at the old one
    requestAnimationFrame(() =>
      ref.current?.scrollToOffset({ offset: hideOffset(), animated: false }),
    );
  }

  // a pull down from the top shows all of the bar, any other scroll hides it
  function settle() {
    const { from } = drag.current;
    const { offset } = sizes.current;
    if (from === null) return;
    drag.current.from = null;
    const pulled = from <= hideOffset() + 1 && offset <= from;
    if (pulled && offset > 0) {
      ref.current?.scrollToOffset({ offset: 0, animated: true });
    } else if (!pulled) hide();
  }

  return {
    ref,
    /** for the rows' container */
    minHeight: height + barHeight,
    /** for a view the list fills, empty it reports its empty component's layout as its own */
    frame: {
      onLayout(event: LayoutChangeEvent) {
        sizes.current.list = event.nativeEvent.layout.height;
        lastHeight = sizes.current.list;
        setHeight(sizes.current.list);
        hideFirst();
      },
    },
    list: {
      contentOffset: startOffset,
      onContentSizeChange(_width: number, rowsHeight: number) {
        sizes.current.rows = rowsHeight;
        hideFirst();
      },
      onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        sizes.current.offset = event.nativeEvent.contentOffset.y;
      },
      onScrollBeginDrag() {
        touch.dragged = true;
        clearTimeout(drag.current.settle);
        drag.current.from = sizes.current.offset;
      },
      onScrollEndDrag() {
        drag.current.settle = setTimeout(settle, MOMENTUM_MS);
      },
      onMomentumScrollBegin() {
        clearTimeout(drag.current.settle);
      },
      onMomentumScrollEnd: settle,
    },
    /** for the bar's view, its touches are its own */
    barView: {
      onTouchEnd() {
        touch.onBar = true;
      },
    },
    /** the bar's field, losing focus as it hides */
    input,
  };
}
