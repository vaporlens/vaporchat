import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

const DURATION_MS = 220;
// how far it travels in, small enough to stay a hint
const OFFSET = 24;

/** Fades its content in when it mounts, sliding it a little from the side it comes from. */
export function Appear({
  from,
  style,
  children,
}: {
  from?: 'right' | 'bottom';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);
  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [OFFSET, 0],
  });
  const transform =
    from === 'right'
      ? [{ translateX: offset }]
      : from === 'bottom'
        ? [{ translateY: offset }]
        : [];
  return (
    <Animated.View style={[style, { opacity: progress, transform }]}>
      {children}
    </Animated.View>
  );
}
