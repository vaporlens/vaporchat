import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  type GestureResponderEvent,
  type NativeTouchEvent,
  useWindowDimensions,
} from 'react-native';

const MAX_SCALE = 4;

interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const distance = ([a, b]: NativeTouchEvent[]) =>
  Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

/**
 * Pinch to zoom its content, up to 4×, and drag it around while zoomed. Android's scroll views
 * don't zoom, unlike iOS's. Plain touch events, the responder system loses the gesture in a modal.
 * `onZoom` true once a pinch starts or it's zoomed in, false once every finger is up at 1×.
 */
export function Zoomable({
  onZoom,
  children,
}: {
  onZoom?: (zoomed: boolean) => void;
  children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  // the latest, the handlers keep the zoom they're at
  const latest = useRef(onZoom);
  useEffect(() => {
    latest.current = onZoom;
  });
  const scale = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.ValueXY()).current;
  const handlers = useMemo(() => {
    let zoom = 1;
    let at: Point = { x: 0, y: 0 };
    // where the current pinch started, and the finger dragging
    let pinch: { distance: number; zoom: number } | null = null;
    let finger: Point | null = null;
    // false while the fingers are up at 1×, a pinch zooming out to 1× is still a pinch
    let zooming = false;
    const report = (now: boolean) => {
      if (now === zooming) return;
      zooming = now;
      latest.current?.(now);
    };
    // a finger more or less starts over from where the others are
    const restart = ({ nativeEvent: { touches } }: GestureResponderEvent) => {
      pinch = null;
      finger = null;
      if (touches.length >= 2) report(true);
      else if (touches.length === 0 && zoom === 1) report(false);
    };
    const onTouchMove = ({
      nativeEvent: { touches },
    }: GestureResponderEvent) => {
      // one finger only drags content that's zoomed in
      if (touches.length < 2 && zoom === 1) return;
      let { x, y } = at;
      if (touches.length >= 2) {
        pinch ??= { distance: distance(touches), zoom };
        const zoomed = clamp(
          (pinch.zoom * distance(touches)) / pinch.distance,
          1,
          MAX_SCALE,
        );
        // each update re-renders the transform natively, only what changed
        if (zoomed !== zoom) {
          zoom = zoomed;
          scale.setValue(zoom);
        }
        finger = null;
      } else {
        const [touch] = touches;
        if (finger) {
          x += touch.pageX - finger.x;
          y += touch.pageY - finger.y;
        }
        finger = { x: touch.pageX, y: touch.pageY };
        pinch = null;
      }
      // never past the content's edges
      const edgeX = (width * (zoom - 1)) / 2;
      const edgeY = (height * (zoom - 1)) / 2;
      x = clamp(x, -edgeX, edgeX);
      y = clamp(y, -edgeY, edgeY);
      if (x !== at.x || y !== at.y) {
        at = { x, y };
        offset.setValue(at);
      }
    };
    return {
      onTouchStart: restart,
      onTouchMove,
      onTouchEnd: restart,
      onTouchCancel: restart,
    };
  }, [width, height, scale, offset]);
  return (
    <Animated.View
      {...handlers}
      style={{
        transform: [
          { translateX: offset.x },
          { translateY: offset.y },
          { scale },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
