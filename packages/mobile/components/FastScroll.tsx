import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  type ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/** A heading's place in the content. */
interface Placed {
  title: string;
  y: number;
}

/** A heading in the content, naming the part from it on. */
interface Section {
  ref: RefObject<Text | null>;
  title: string;
}

const SectionsContext = createContext<Set<Section> | null>(null);

/** The heading at `ref` labels the handle over its part, inside a `FastScrollView`. */
export function useSection(ref: RefObject<Text | null>, title: string) {
  const sections = useContext(SectionsContext);
  useEffect(() => {
    // a heading of emoticons alone has no title to list
    if (!sections || !title) return;
    const section = { ref, title };
    sections.add(section);
    return () => {
      sections.delete(section);
    };
  }, [sections, ref, title]);
}

/** Content whose headings aren't the page's parts, like comments. */
export function NoSections({ children }: { children: ReactNode }) {
  return (
    <SectionsContext.Provider value={null}>{children}</SectionsContext.Provider>
  );
}

// content this many times as tall as the view gets the handle
const LONG = 3;
const THUMB_HEIGHT = 48;
// between the handle's ends and the view's
const MARGIN = 8;
const GRIP_WIDTH = 32;
// the headings listed beside it: this many before and after the current one
const AROUND = 5;
const ENTRY_HEIGHT = 36;
const LIST_WIDTH = 300;
const LIST_BORDER = 1;

/**
 * A scroll view whose content, when `fastScroll` and long, gets a handle at its right edge to drag
 * through it, beside the headings around the part it's at. The handle follows every frame while
 * `onScroll` comes at most every `scrollEventThrottle` ms, the last scroll always.
 */
export function FastScrollView({
  fastScroll = false,
  contentContainerStyle,
  refreshControl,
  onScroll,
  scrollEventThrottle = 0,
  children,
}: Pick<ScrollViewProps, 'contentContainerStyle' | 'refreshControl'> & {
  fastScroll?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [sections] = useState(() => new Set<Section>());
  const [scrollY] = useState(() => new Animated.Value(0));
  const [size, setSize] = useState({ view: 0, content: 0 });
  const [dragging, setDragging] = useState(false);
  // the headings, which one's part it's at (-1 above the first), where the thumb is on its travel
  const [shown, setShown] = useState({
    placed: [] as Placed[],
    current: -1,
    at: 0,
  });
  const { width } = useWindowDimensions();
  const max = size.content - size.view;
  const travel = size.view - THUMB_HEIGHT - 2 * MARGIN - insets.bottom;
  const long = fastScroll && size.view > 0 && size.content > LONG * size.view;

  const latest = useRef({
    onScroll,
    scrollEventThrottle,
    max,
    travel,
    view: size.view,
  });
  useEffect(() => {
    latest.current = {
      onScroll,
      scrollEventThrottle,
      max,
      travel,
      view: size.view,
    };
  });
  // where it's scrolled to, and the headings' places in the content
  const offset = useRef(0);
  const placed = useRef<Placed[]>([]);
  const origin = useRef<View>(null);
  const trailing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(trailing.current), []);
  // as a drag starts and as the content grows under it
  const measure = useCallback(() => {
    origin.current?.measureInWindow((_x, top) => {
      const found: Placed[] = [];
      placed.current = found;
      for (const section of sections) {
        section.ref.current?.measureInWindow((_x, y) => {
          found.push({ title: section.title, y: y - top });
          found.sort((a, b) => a.y - b.y);
        });
      }
    });
  }, [sections]);

  const [handler] = useState(() => {
    let last = 0;
    return Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = event.nativeEvent.contentOffset.y;
          const { onScroll, scrollEventThrottle } = latest.current;
          if (!onScroll) return;
          clearTimeout(trailing.current);
          // the event is cleared once handled, a later call gets a copy
          const kept = { ...event, nativeEvent: event.nativeEvent };
          const call = () => {
            last = Date.now();
            onScroll(kept);
          };
          const wait = last + scrollEventThrottle - Date.now();
          if (wait <= 0) call();
          else trailing.current = setTimeout(call, wait);
        },
      },
    );
  });

  // where along its travel the finger holds the thumb
  const held = useRef(0);
  // scrolls to where the thumb at `at` is and lists the headings around the part there: the part
  // read at the top of the view at the start, at its bottom at the end
  const follow = useCallback((at: number) => {
    held.current = at;
    const { max, travel, view } = latest.current;
    scroll.current?.scrollTo({ y: (at / travel) * max, animated: false });
    const reading = (at / travel) * (max + view);
    const current =
      placed.current.filter((section) => section.y <= reading).length - 1;
    setShown({ placed: placed.current, current, at });
  }, []);
  // as a drag starts, which stops a fling, and as the content's or view's size changes under a
  // held thumb, which stays under the finger
  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns as max changes with either size
  useEffect(() => {
    if (!dragging) return;
    measure();
    follow(held.current);
  }, [dragging, max]);

  const [responder] = useState(() => {
    // where along its travel the thumb was grabbed
    let grabbed = 0;
    const end = () => setDragging(false);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { max, travel } = latest.current;
        grabbed = (Math.min(max, Math.max(0, offset.current)) / max) * travel;
        held.current = grabbed;
        // the last drag's list stays hidden until this one's is placed
        setShown((shown) => ({ ...shown, placed: [] }));
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        follow(
          Math.min(latest.current.travel, Math.max(0, grabbed + gesture.dy)),
        );
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  });

  const from = Math.max(0, shown.current - AROUND);
  const listed = shown.placed.slice(from, shown.current + AROUND + 1);
  // the current one beside the thumb, those before above it, all within the view
  const listTop = Math.max(
    -shown.at,
    Math.min(
      THUMB_HEIGHT / 2 - (shown.current - from + 0.5) * ENTRY_HEIGHT,
      travel +
        THUMB_HEIGHT -
        shown.at -
        listed.length * ENTRY_HEIGHT -
        2 * LIST_BORDER,
    ),
  );

  return (
    <View style={styles.box}>
      <Animated.ScrollView
        ref={scroll}
        contentContainerStyle={contentContainerStyle}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={!long}
        onScroll={handler}
        // every frame for the handle
        scrollEventThrottle={long ? 16 : scrollEventThrottle}
        onLayout={(event) => {
          const view = event.nativeEvent.layout.height;
          setSize((size) => ({ ...size, view }));
        }}
        onContentSizeChange={(_width, content) =>
          setSize((size) => ({ ...size, content }))
        }
      >
        <SectionsContext.Provider value={fastScroll ? sections : null}>
          {fastScroll && <View ref={origin} style={styles.origin} />}
          {children}
        </SectionsContext.Provider>
      </Animated.ScrollView>
      {long && (
        <Animated.View
          pointerEvents="box-none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.handle,
            {
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [0, max],
                    outputRange: [0, travel],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          {dragging && listed.length > 0 && (
            <View
              pointerEvents="none"
              style={[
                styles.list,
                {
                  width: Math.min(LIST_WIDTH, width - 2 * GRIP_WIDTH),
                  top: listTop,
                },
              ]}
            >
              {listed.map((section) => (
                <Text
                  key={section.y}
                  numberOfLines={1}
                  style={[
                    styles.entry,
                    section === shown.placed[shown.current] && styles.current,
                  ]}
                >
                  {section.title}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.grip} {...responder.panHandlers}>
            <View style={[styles.thumb, dragging && styles.dragged]} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // the list stays off the header above
  box: { flex: 1, overflow: 'hidden' },
  // the content's top, out of its flow
  origin: { position: 'absolute', top: 0 },
  handle: {
    position: 'absolute',
    top: MARGIN,
    right: 0,
  },
  list: {
    position: 'absolute',
    right: GRIP_WIDTH,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: LIST_BORDER,
    borderColor: colors.border,
  },
  entry: {
    height: ENTRY_HEIGHT,
    lineHeight: ENTRY_HEIGHT,
    paddingHorizontal: 12,
    color: colors.muted,
    fontSize: 14,
  },
  current: {
    color: colors.bright,
    fontWeight: '700',
    backgroundColor: colors.surfaceRaised,
  },
  // wider than it looks, for a finger
  grip: {
    width: GRIP_WIDTH,
    height: THUMB_HEIGHT,
    alignItems: 'flex-end',
    paddingRight: 3,
  },
  thumb: {
    width: 5,
    height: THUMB_HEIGHT,
    borderRadius: 3,
    backgroundColor: colors.muted,
    opacity: 0.6,
  },
  dragged: { width: 7, backgroundColor: colors.accent, opacity: 1 },
});
