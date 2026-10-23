import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoDetails } from '../components/InfoDetails';
import { type Info, InfoSheet } from '../components/InfoSheet';
import { emotionColor } from '../emotionColors';
import { colors } from '../theme';
import type {
  GameFit,
  VaporlensReport as Report,
  ReviewPoint,
} from '../vaporlens';
import { HardwareCohorts, OUTCOMES } from './HardwareCohorts';
import { VaporlensGauges } from './VaporlensGauges';

type PointKey =
  | 'positives'
  | 'negatives'
  | 'gameplay'
  | 'performance'
  | 'recommendations';

// vaporlens's section icons
const SECTIONS: {
  key: PointKey;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  {
    key: 'positives',
    title: 'What players like',
    icon: 'add',
    color: '#16794a',
  },
  {
    key: 'negatives',
    title: 'Common complaints',
    icon: 'remove',
    color: '#9b1c1c',
  },
  {
    key: 'gameplay',
    title: 'Gameplay',
    icon: 'game-controller',
    color: '#0b5e94',
  },
  {
    key: 'performance',
    title: 'Performance',
    icon: 'stats-chart',
    color: '#6b21a8',
  },
  {
    key: 'recommendations',
    title: 'Recommendations',
    icon: 'star',
    color: '#c2620c',
  },
];

// the most common hardware, the rest are in a sheet
const SHOWN_HARDWARE = 2;

function byImportance(points: ReviewPoint[]) {
  return [...points].sort((a, b) => b.importance - a.importance);
}

/** A tappable name joined to its value, the way vaporlens shows emotions and players. */
function Chip({
  text,
  value,
  color = colors.text,
  border = colors.border,
  onPress,
}: {
  text: string;
  value?: string;
  color?: string;
  border?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, { color }]}>{text}</Text>
      {value && <Text style={styles.chipValue}>{value}</Text>}
    </Pressable>
  );
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.chips}>
      <Text style={styles.chipsLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** VaporLens's take on a game's Steam reviews as part of its page, the explanations in a sheet when tapped. */
export function VaporlensReport({
  report,
  fit,
  originalPrice,
  onOpenFull,
}: {
  report: Report;
  /** null while signed out of vaporlens.app or loading */
  fit: GameFit | null;
  /** the game's price before any discount */
  originalPrice: string | null;
  onOpenFull: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const extractions = report.featureExtractions ?? {};
  const emotions = byImportance(report.emotions ?? []);
  const archetypes = extractions.playerArchetypesExtraction?.archetypes ?? [];
  const hardware = report.hardware;
  const segments = hardware?.segments ?? [];
  const hiddenSegments = segments.length - SHOWN_HARDWARE;
  const explain = (point: ReviewPoint) =>
    setInfo({ title: point.point, body: point.explanation });

  return (
    <View style={styles.report}>
      <Pressable
        onPress={onOpenFull}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <FontAwesome6 name="microscope" size={13} color={colors.muted} />
        <Text style={styles.brand}>VaporLens</Text>
        <Text style={styles.full}>Full report</Text>
        <Ionicons name="chevron-forward" size={13} color={colors.accent} />
      </Pressable>
      {report.summary?.length ? (
        <View>
          {report.summary.map((line) => (
            <View key={line} style={styles.bullet}>
              <Text style={styles.summary}>•</Text>
              <Text style={[styles.summary, styles.grow]}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <VaporlensGauges
        report={report}
        fit={fit}
        originalPrice={originalPrice}
        onInfo={setInfo}
      />
      {emotions.length > 0 && (
        <Chips label="Feel">
          {emotions.map((emotion) => (
            <Chip
              key={emotion.point}
              text={emotion.point}
              value={`${Math.round(emotion.importance * 100)}%`}
              color={emotionColor(emotion.point)}
              border={`${emotionColor(emotion.point)}55`}
              onPress={() => explain(emotion)}
            />
          ))}
        </Chips>
      )}
      {archetypes.length > 0 && (
        <Chips label="Enjoyed by">
          {archetypes.map((archetype) => (
            <Chip
              key={archetype.archetypeName}
              text={archetype.archetypeName}
              value={archetype.recommendationStance}
              onPress={() =>
                setInfo({
                  title: archetype.archetypeName,
                  subtitle: `${archetype.experienceLevel} · recommends: ${archetype.recommendationStance}`,
                  body: (
                    <InfoDetails
                      lead={archetype.playstyle}
                      sections={[
                        {
                          label: 'Plays for',
                          text: archetype.primaryMotivation,
                        },
                        {
                          label: 'Calls themselves',
                          text: archetype.selfIdentifyingLabels.join(' · '),
                        },
                        {
                          label: 'Also plays',
                          text: archetype.referenceGames.join(' · '),
                        },
                        { label: 'Why this group', text: archetype.reasoning },
                      ]}
                    />
                  ),
                })
              }
            />
          ))}
        </Chips>
      )}
      {segments.length > 0 && (
        <Chips label="Hardware">
          {segments.slice(0, SHOWN_HARDWARE).map((segment) => (
            <Chip
              key={segment.label}
              text={segment.label}
              value={OUTCOMES[segment.outcome].title}
              border={`${OUTCOMES[segment.outcome].color}88`}
              onPress={() =>
                setInfo({
                  title: segment.label,
                  subtitle: `${OUTCOMES[segment.outcome].title} · ${segment.count.toLocaleString()} reviews`,
                  body: segment.note,
                })
              }
            />
          ))}
          {hardware && (
            <Chip
              text="More"
              value={hiddenSegments > 0 ? `+${hiddenSegments}` : undefined}
              color={colors.accent}
              onPress={() =>
                setInfo({
                  title: 'Hardware',
                  body: <HardwareCohorts hardware={hardware} />,
                })
              }
            />
          )}
        </Chips>
      )}
      {SECTIONS.map(({ key, title, icon, color }) => {
        const points = report[key];
        if (!points?.length) return null;
        return (
          <View key={key}>
            <View style={styles.sectionTitle}>
              <View style={[styles.icon, { backgroundColor: color }]}>
                <Ionicons name={icon} size={16} color={colors.bright} />
              </View>
              <Text style={styles.sectionText}>{title}</Text>
            </View>
            {byImportance(points).map((point) => (
              <Pressable
                key={point.point}
                onPress={() => explain(point)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.point} numberOfLines={1}>
                  {point.point}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      })}
      <InfoSheet info={info} onClose={() => setInfo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // part of the game page, set apart from steam's part above and below it
  report: {
    gap: 18,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: { flex: 1, color: colors.muted, fontSize: 14 },
  full: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  bullet: { flexDirection: 'row', gap: 8 },
  summary: { color: colors.bright, fontSize: 15, lineHeight: 23 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  chipsLabel: { color: colors.muted, fontSize: 12, marginRight: 2 },
  chip: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  chipText: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 3 },
  chipValue: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: { color: colors.bright, fontSize: 16, fontWeight: '700' },
  point: { color: colors.text, fontSize: 14, paddingVertical: 4 },
});
