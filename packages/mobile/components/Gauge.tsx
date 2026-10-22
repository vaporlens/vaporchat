import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../theme';

const STROKE = 4;
// of the circle, the arc is open at the bottom like a speedometer's
const SWEEP = 0.75;

/** A round gauge with a label and maybe a value in it. A plain circle without `fill`. */
export function Gauge({
  size,
  label,
  value,
  fill,
  color = colors.accent,
  accessibilityLabel,
  onPress,
}: {
  size: number;
  label: string;
  value?: string;
  /** 0 to 1 of the arc drawn in `color` */
  fill?: number;
  color?: string;
  /** what screen readers say, `label` and `value` by default */
  accessibilityLabel?: string;
  onPress?: () => void;
}) {
  const center = size / 2;
  const radius = (size - STROKE) / 2;
  const length = 2 * Math.PI * radius;
  const arc = (part: number, stroke: string) => (
    <Circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={stroke}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeDasharray={`${length * SWEEP * part} ${length}`}
    />
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        accessibilityLabel ?? [label, value].filter(Boolean).join(', ')
      }
      style={({ pressed }) => [
        styles.gauge,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {fill === undefined ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors.surfaceRaised}
            strokeWidth={STROKE}
          />
        ) : (
          // from the bottom left, clockwise
          <G rotation={135} origin={`${center}, ${center}`}>
            {arc(1, colors.surfaceRaised)}
            {fill > 0 && arc(fill, color)}
          </G>
        )}
      </Svg>
      <Text
        style={value ? styles.label : styles.value}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
      {value && (
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gauge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: STROKE + 3,
  },
  pressed: { opacity: 0.6 },
  label: { color: colors.muted, fontSize: 10 },
  value: { color: colors.bright, fontSize: 12, fontWeight: '600' },
});
