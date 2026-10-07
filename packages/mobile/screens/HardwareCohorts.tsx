import { StyleSheet, Text, View } from 'react-native';
import { SectionTitle } from '../components/SectionTitle';
import { colors } from '../theme';
import type { Hardware, HardwareSegment } from '../vaporlens';

export const OUTCOMES: Record<
  HardwareSegment['outcome'],
  { title: string; color: string }
> = {
  positive: { title: 'Good', color: colors.accept },
  mixed: { title: 'Mixed', color: colors.warning },
  negative: { title: 'Bad', color: colors.danger },
};

/**
 * How a game runs on each kind of hardware reviewers had, a line each and what they said, between
 * how many reviews told their hardware and what to keep in mind. The way vaporlens shows it.
 */
export function HardwareCohorts({ hardware }: { hardware: Hardware }) {
  return (
    <View style={styles.list}>
      <Text style={styles.summary}>{hardware.summary}</Text>
      <View style={styles.fact}>
        <SectionTitle title="Coverage" />
        <Text style={styles.note}>
          {hardware.sampleSize.toLocaleString()} tagged reviews ·{' '}
          {hardware.coveragePct}% coverage
        </Text>
      </View>
      <View style={styles.fact}>
        <SectionTitle title="Audience skew" />
        <Text style={styles.note}>{hardware.audienceSkew}</Text>
      </View>
      {hardware.segments.map((segment) => {
        const outcome = OUTCOMES[segment.outcome];
        return (
          <View key={segment.label} style={styles.cohort}>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: outcome.color }]} />
              <Text style={styles.label}>{segment.label}</Text>
              <Text style={[styles.outcome, { color: outcome.color }]}>
                {outcome.title}
              </Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.note}>{segment.note}</Text>
              <Text style={styles.count}>
                {segment.count.toLocaleString()} hardware-tagged reviews
              </Text>
            </View>
          </View>
        );
      })}
      {hardware.caveats.length > 0 && (
        <View style={styles.fact}>
          <SectionTitle title="Caveats" />
          {hardware.caveats.map((caveat) => (
            <Text key={caveat} style={styles.note}>
              • {caveat}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const DOT = 8;
const DOT_GAP = 8;

const styles = StyleSheet.create({
  list: { gap: 16 },
  summary: { color: colors.text, fontSize: 15, lineHeight: 22 },
  fact: { gap: 4 },
  cohort: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: DOT_GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  label: { flex: 1, color: colors.bright, fontSize: 15, fontWeight: '600' },
  outcome: { fontSize: 13, fontWeight: '600' },
  // under the label, past the dot
  body: { gap: 2, marginLeft: DOT + DOT_GAP },
  note: { color: colors.text, fontSize: 14, lineHeight: 20 },
  count: { color: colors.muted, fontSize: 12 },
});
