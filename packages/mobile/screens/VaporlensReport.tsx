import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Info, InfoSheet } from '../components/InfoSheet';
import { SectionTitle } from '../components/SectionTitle';
import { colors } from '../theme';
import type {
  HardwareSegment,
  VaporlensReport as Report,
  ReviewPoint,
} from '../vaporlens';

type PointKey =
  | 'positives'
  | 'negatives'
  | 'gameplay'
  | 'performance'
  | 'recommendations'
  | 'emotions';

// pros and cons are a line each, the rest are pills to fit more
const LISTS: {
  key: PointKey;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: 'positives', title: 'Pros', icon: 'add-circle', color: colors.accept },
  {
    key: 'negatives',
    title: 'Cons',
    icon: 'remove-circle',
    color: colors.danger,
  },
];
const PILLS: { key: PointKey; title: string }[] = [
  { key: 'gameplay', title: 'Gameplay' },
  { key: 'performance', title: 'Performance' },
  { key: 'recommendations', title: 'Who it’s for' },
  { key: 'emotions', title: 'How players feel' },
];

const SCANS: {
  key: keyof NonNullable<Report['featureScans']>;
  title: string;
}[] = [
  { key: 'steamDeckScan', title: 'Steam Deck' },
  { key: 'protonLinuxScan', title: 'Linux / Proton' },
  { key: 'mtxScan', title: 'DLC & microtransactions' },
  { key: 'modScan', title: 'Mods' },
  { key: 'wikiScan', title: 'Guides & wikis' },
];

const OUTCOMES: Record<HardwareSegment['outcome'], string> = {
  positive: colors.accept,
  mixed: colors.warning,
  negative: colors.danger,
};

// scan scores count problems, lower is better
function scanColor(score: number) {
  if (score <= 25) return colors.accept;
  if (score <= 50) return colors.warning;
  return colors.danger;
}

function minutes(value: number) {
  return value >= 60 ? `${Math.round(value / 60)} h` : `${value} min`;
}

function byImportance(points: ReviewPoint[]) {
  return [...points].sort((a, b) => b.importance - a.importance);
}

function Title({ children }: { children: string }) {
  return <SectionTitle title={children} style={styles.title} />;
}

/** One tappable line: something on the left, its text, something on the right. */
function Line({
  left,
  text,
  right,
  onPress,
}: {
  left?: ReactNode;
  text: string;
  right?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      {left}
      <Text style={styles.lineText} numberOfLines={1}>
        {text}
      </Text>
      {right}
    </Pressable>
  );
}

function Pill({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Text style={styles.pillText}>{text}</Text>
    </Pressable>
  );
}

/** VaporLens's take on a game's Steam reviews as part of its page, the explanations in a sheet when tapped. */
export function VaporlensReport({
  report,
  onOpenFull,
}: {
  report: Report;
  onOpenFull: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const extractions = report.featureExtractions ?? {};
  const price = extractions.priceExtraction?.priceRangeUsd;
  const playtime = extractions.playtimeExtraction?.playtimeHours;
  const fun = extractions.timeToFunExtraction;
  const facts = [
    price?.min !== undefined && price.max !== undefined
      ? `Worth $${price.min}–${price.max}`
      : null,
    ...(
      [
        ['Story', playtime?.storyCompletion],
        ['100%', playtime?.gameCompletion],
        ['Sessions', playtime?.sessionLength],
      ] as const
    ).map(([label, hours]) => (hours ? `${label} ${hours} h` : null)),
  ].filter((fact): fact is string => Boolean(fact));
  const scans = SCANS.flatMap(({ key, title }) => {
    const scan = report.featureScans?.[key];
    return scan ? [{ title, scan }] : [];
  });
  const hardware = report.hardware;
  const archetypes = extractions.playerArchetypesExtraction?.archetypes ?? [];
  const explain = (point: ReviewPoint) =>
    setInfo({ title: point.point, body: point.explanation });

  return (
    <View style={styles.report}>
      {facts.length > 0 && (
        <View style={styles.wrap}>
          {facts.map((fact) => (
            <Text key={fact} style={styles.fact}>
              {fact}
            </Text>
          ))}
        </View>
      )}
      {fun?.summary && (
        <Line
          left={<Ionicons name="time" size={15} color={colors.accent} />}
          text={`Fun ${fun.timeToAnchorMinutes ? `after ${minutes(fun.timeToAnchorMinutes)}` : 'from the start'}${fun.stance ? ` · ${fun.stance}` : ''}`}
          onPress={() =>
            setInfo({
              title: 'Time to fun',
              subtitle: fun.stance,
              body: fun.summary ?? '',
            })
          }
        />
      )}
      {LISTS.map(({ key, title, icon, color }) => {
        const points = report[key];
        if (!points?.length) return null;
        return (
          <View key={key}>
            <Title>{title}</Title>
            {byImportance(points).map((point) => (
              <Line
                key={point.point}
                left={<Ionicons name={icon} size={15} color={color} />}
                text={point.point}
                onPress={() => explain(point)}
              />
            ))}
          </View>
        );
      })}
      {PILLS.map(({ key, title }) => {
        const points = report[key];
        if (!points?.length) return null;
        return (
          <View key={key} style={styles.section}>
            <Title>{title}</Title>
            <View style={styles.wrap}>
              {byImportance(points).map((point) => (
                <Pill
                  key={point.point}
                  text={point.point}
                  onPress={() => explain(point)}
                />
              ))}
            </View>
          </View>
        );
      })}
      {scans.length > 0 && (
        <View>
          <Title>Checks</Title>
          {scans.map(({ title, scan }) => (
            <Line
              key={title}
              text={title}
              right={
                <Text
                  style={[styles.verdict, { color: scanColor(scan.score) }]}
                  numberOfLines={1}
                >
                  {scan.verdict}
                </Text>
              }
              onPress={() =>
                setInfo({ title, subtitle: scan.verdict, body: scan.summary })
              }
            />
          ))}
        </View>
      )}
      {hardware?.segments?.length ? (
        <View>
          <Pressable
            onPress={() =>
              hardware.summary &&
              setInfo({ title: 'Hardware', body: hardware.summary })
            }
            style={styles.titleLine}
          >
            <Title>Hardware</Title>
            {hardware.summary && (
              <Ionicons
                name="information-circle-outline"
                size={14}
                color={colors.muted}
              />
            )}
          </Pressable>
          {hardware.segments.map((segment) => (
            <Line
              key={segment.label}
              left={
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: OUTCOMES[segment.outcome] },
                  ]}
                />
              }
              text={segment.label}
              right={<Text style={styles.muted}>{segment.count} reviews</Text>}
              onPress={() =>
                setInfo({
                  title: segment.label,
                  subtitle: `${segment.outcome} · ${segment.count} reviews`,
                  body: segment.note,
                })
              }
            />
          ))}
        </View>
      ) : null}
      {archetypes.length > 0 && (
        <View style={styles.section}>
          <Title>Players who enjoy it</Title>
          <View style={styles.wrap}>
            {archetypes.map((archetype) => (
              <Pill
                key={archetype.archetypeName}
                text={archetype.archetypeName}
                onPress={() =>
                  setInfo({
                    title: archetype.archetypeName,
                    subtitle: `Recommends: ${archetype.recommendationStance}`,
                    body: archetype.playstyle,
                  })
                }
              />
            ))}
          </View>
        </View>
      )}
      <Pressable
        onPress={onOpenFull}
        style={({ pressed }) => [styles.credit, pressed && styles.pressed]}
      >
        <FontAwesome6 name="microscope" size={12} color={colors.accent} />
        <Text style={styles.creditText}>Review analysis by VaporLens</Text>
        <Ionicons name="chevron-forward" size={13} color={colors.accent} />
      </Pressable>
      <InfoSheet info={info} onClose={() => setInfo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // part of the game page, spaced like the rest of it
  report: { gap: 14 },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  creditText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    color: colors.bright,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  section: { gap: 6 },
  // the game page's section titles
  title: { marginBottom: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  pressed: { opacity: 0.6 },
  lineText: { flex: 1, color: colors.text, fontSize: 14 },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: { color: colors.text, fontSize: 12 },
  verdict: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
  muted: { color: colors.muted, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
