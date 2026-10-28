import { type ReactNode, useRef } from 'react';
import { ScrollView } from 'react-native';

/** Pinch to zoom its content, up to 4×. `onZoom` when it zooms in from 1× or back out to it. */
export function Zoomable({
  onZoom,
  children,
}: {
  onZoom?: (zoomed: boolean) => void;
  children: ReactNode;
}) {
  const zoomed = useRef(false);
  return (
    <ScrollView
      maximumZoomScale={4}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      // zooming scrolls it too
      scrollEventThrottle={16}
      onScroll={({ nativeEvent: { zoomScale } }) => {
        if (zoomScale > 1 === zoomed.current) return;
        zoomed.current = zoomScale > 1;
        onZoom?.(zoomed.current);
      }}
    >
      {children}
    </ScrollView>
  );
}
