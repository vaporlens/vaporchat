import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

/** Pinch to zoom its content, up to 4×. */
export function Zoomable({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      maximumZoomScale={4}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
