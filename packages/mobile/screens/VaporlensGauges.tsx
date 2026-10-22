import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gauge } from '../components/Gauge';
import { InfoDetails } from '../components/InfoDetails';
import type { Info } from '../components/InfoSheet';
import { colors } from '../theme';
import type { VaporlensReport as Report } from '../vaporlens';

// vaporlens's names for its scans, shorter on the gauges
const SCANS: {
  key: keyof NonNullable<Report['featureScans']>;
  label: string;
  title: string;
}[] = [
  { key: 'reviewMix', label: 'Reviews', title: 'Review Mix' },
  { key: 'mtxScan', label: 'MTX', title: 'MTX Index' },
  { key: 'modScan', label: 'Mod Tax', title: 'Mod Tax Index' },
  { key: 'wikiScan', label: 'Wiki', title: 'Wiki Index' },
  { key: 'protonLinuxScan', label: 'Linux', title: 'Linux Index' },
  { key: 'steamDeckScan', label: 'Deck', title: 'Deck Index' },
];

// six gauges to a row of the page, inside its padding
const GAUGES_IN_ROW = 6;
const GAUGE_GAP = 8;
const PAGE_PADDING = 16;

// scan scores count problems, lower is better
function scanColor(score: number) {
  if (score <= 25) return colors.accept;
  if (score <= 50) return colors.warning;
  return colors.danger;
}

// the formats vaporlens shows its numbers in
function hours(value: number | null | undefined) {
  return value == null ? 'N/A' : `${value.toFixed(1)}h`;
}

function duration(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return 'N/A';
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h > 0 && `${h}h`, (m > 0 || h === 0) && `${m}m`]
    .filter(Boolean)
    .join(' ');
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function list(items: string[]) {
  return items.length ? items.join('; ') : 'N/A';
}

const PLAYTIMES = [
  ['Game completion', 'gameCompletion'],
  ['Story completion', 'storyCompletion'],
  ['Session length', 'sessionLength'],
  ['Endgame', 'endgame'],
] as const;

/**
 * VaporLens's gauges of a game: its scans, the price players find fair, playtime and time to fun.
 * Tapping one shows what VaporLens shows for it.
 */
export function VaporlensGauges({
  report,
  originalPrice,
  onInfo,
}: {
  report: Report;
  /** the game's price before any discount */
  originalPrice: string | null;
  onInfo: (info: Info) => void;
}) {
  const { width } = useWindowDimensions();
  const size = Math.floor(
    (width - 2 * PAGE_PADDING - (GAUGES_IN_ROW - 1) * GAUGE_GAP) /
      GAUGES_IN_ROW,
  );
  const extractions = report.featureExtractions ?? {};
  const price = extractions.priceExtraction;
  const playtime = extractions.playtimeExtraction;
  const fun = extractions.timeToFunExtraction;
  const scans = SCANS.flatMap((config) => {
    const scan = report.featureScans?.[config.key];
    // -1 when vaporlens couldn't tell
    return scan && scan.score !== -1 ? [{ ...config, scan }] : [];
  });

  return (
    <View style={styles.gauges}>
      {scans.map(({ label, title, scan }) => {
        const score = Math.min(100, Math.max(0, Math.round(scan.score)));
        return (
          <Gauge
            key={title}
            size={size}
            label={label}
            accessibilityLabel={`${title}, ${score} of 100, lower is better`}
            fill={(100 - score) / 100}
            color={scanColor(score)}
            onPress={() =>
              onInfo({
                title,
                body: (
                  <InfoDetails
                    sections={[
                      { label: 'Verdict', text: scan.verdict },
                      {
                        label: 'Summary',
                        text: `${scan.summary} Score: ${score} / 100`,
                      },
                    ]}
                  />
                ),
              })
            }
          />
        );
      })}
      {price && (
        <Gauge
          size={size}
          label="Price"
          value={`~$${Math.round((price.priceRangeUsd.min + price.priceRangeUsd.max) / 2)}`}
          onPress={() => {
            const { min, max } = price.priceRangeUsd;
            const low = Math.min(min, max);
            const high = Math.max(min, max);
            onInfo({
              title: 'Price',
              body: (
                <InfoDetails
                  sections={[
                    {
                      label: 'Community fair range',
                      text:
                        high - low < 0.01
                          ? `$${low.toFixed(2)}`
                          : `$${low.toFixed(2)} - $${high.toFixed(2)}`,
                    },
                    {
                      label: 'Original price',
                      text: originalPrice ?? undefined,
                    },
                    { label: 'Reasoning', text: price.reasoning },
                  ]}
                />
              ),
            });
          }}
        />
      )}
      {playtime && (
        <Gauge
          size={size}
          label="Playtime"
          value={hours(
            playtime.playtimeHours.gameCompletion ??
              playtime.playtimeHours.storyCompletion,
          )}
          onPress={() =>
            onInfo({
              title: 'Playtime',
              body: (
                <InfoDetails
                  sections={[
                    {
                      label: 'Playtime metrics',
                      tiles: PLAYTIMES.map(([label, key]) => ({
                        label,
                        value: hours(playtime.playtimeHours[key]),
                      })),
                    },
                    { label: 'Reasoning', text: playtime.reasoning },
                  ]}
                />
              ),
            })
          }
        />
      )}
      {fun && (
        <Gauge
          size={size}
          label="TTF"
          value={
            fun.timeToAnchorMinutes
              ? duration(fun.timeToAnchorMinutes)
              : fun.stance
          }
          onPress={() =>
            onInfo({
              title: 'Time-to-fun',
              body: (
                <InfoDetails
                  lead={fun.summary}
                  sections={[
                    {
                      tiles: [
                        { label: 'Stance', value: capitalize(fun.stance) },
                        {
                          label: 'Anchor',
                          value: fun.anchor ? capitalize(fun.anchor) : 'N/A',
                        },
                        {
                          label: 'Time to anchor',
                          value: duration(fun.timeToAnchorMinutes),
                        },
                      ],
                    },
                    { label: 'Friction', text: list(fun.friction) },
                    { label: 'Unlock drivers', text: list(fun.unlockDrivers) },
                    { label: 'Conditions', text: list(fun.conditions) },
                  ]}
                />
              ),
            })
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gauges: { flexDirection: 'row', flexWrap: 'wrap', gap: GAUGE_GAP },
});
