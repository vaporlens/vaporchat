import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme';
import { Appear } from './Appear';

// Android has its own back gesture
export const swipesBack = Platform.OS === 'ios';
// how far from the left edge a swipe starts, short of the header's back button
const EDGE = 20;
// a fling this fast goes back however far it went, in px per ms
const FLING = 0.5;

/**
 * A screen pushed over another, coming in from the right and swiped away from the left edge to
 * go back like iOS does.
 */
export function SwipeBack({
  onBack,
  style,
  children,
}: {
  onBack: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  const [responder] = useState(() => {
    const settle = () =>
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) =>
        x.setValue(Math.max(0, gesture.dx)),
      onPanResponderRelease: (_event, gesture) => {
        const width = Dimensions.get('window').width;
        if (gesture.dx > width / 3 || gesture.vx > FLING) {
          Animated.timing(x, {
            toValue: width,
            duration: 200,
            useNativeDriver: true,
          }).start(() => latest.current());
        } else settle();
      },
      onPanResponderTerminate: settle,
    });
  });
  return (
    <Animated.View
      style={[styles.screen, style, { transform: [{ translateX: x }] }]}
    >
      <Appear from="right" style={styles.grow}>
        {children}
      </Appear>
      {/* over the content, a scroll view under the finger would take the swipe before JS could */}
      {swipesBack && <View style={styles.edge} {...responder.panHandlers} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    // its edge over the screen under it, a swipe has them side by side
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  grow: { flex: 1 },
  edge: { position: 'absolute', top: 0, bottom: 0, left: 0, width: EDGE },
});
