import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SteamFeeds } from 'vaporchat/client/feeds';
import type { ReviewCounts } from 'vaporchat/protocol';
import { useCached } from '../cache';
import { colors } from '../theme';

const HEIGHT = 96;
const GAP = 2;
// thinner bars are grouped, a bar then covers several periods
const MIN_BAR = 3;

type Period = 'month' | 'week' | 'day';

/** Bars of one period or more, next to each other. */
interface Bar extends ReviewCounts {
  /** the start of its last period */
  to: number;
}

// steam's dates are midnights in UTC
function periodName(at: number, period: Period) {
  const date = new Date(at);
  if (period === 'month') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return period === 'week' ? `Week of ${day}` : day;
}

function barName(bar: Bar, period: Period) {
  return bar.to === bar.at
    ? periodName(bar.at, period)
    : `${periodName(bar.at, period)} – ${periodName(bar.to, period)}`;
}

/** The periods in bars of `size` periods each. */
function group(counts: ReviewCounts[], size: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < counts.length; i += size) {
    const part = counts.slice(i, i + size);
    bars.push({
      at: part[0].at,
      to: part[part.length - 1].at,
      up: part.reduce((sum, c) => sum + c.up, 0),
      down: part.reduce((sum, c) => sum + c.down, 0),
    });
  }
  return bars;
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Legend({ up, down }: { up: number; down: number }) {
  return (
    <View style={styles.legend}>
      <Key
        color={colors.chartPositive}
        label={`Recommended ${up.toLocaleString()}`}
      />
      <Key
        color={colors.chartNegative}
        label={`Not recommended ${down.toLocaleString()}`}
      />
    </View>
  );
}

/**
 * A game's reviews over time like its store page's chart: recommended above the line, not
 * recommended below, since release or over the last 30 days. Tapping a bar shows its counts.
 */
export function ReviewHistogram({
  feeds,
  appid,
}: {
  feeds: SteamFeeds;
  appid: number;
}) {
  const load = useCallback(
    () => feeds.getReviewHistogram(appid),
    [feeds, appid],
  );
  // the reviews show without it
  const { data } = useCached(`review-histogram-${appid}`, load);
  const [recent, setRecent] = useState(false);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<Bar | null>(null);
  if (!data || data.overall.length === 0) return null;

  const counts = recent ? data.recent : data.overall;
  const period: Period = recent ? 'day' : data.overallPeriod;
  const fit = Math.max(1, Math.floor((width + GAP) / (MIN_BAR + GAP)));
  const bars = group(counts, Math.ceil(counts.length / fit));
  // one scale for both sides, the line sits where the bigger side needs it
  const maxUp = Math.max(0, ...bars.map((bar) => bar.up));
  const maxDown = Math.max(0, ...bars.map((bar) => bar.down));
  const scale = HEIGHT / (maxUp + maxDown || 1);
  const up = counts.reduce((sum, c) => sum + c.up, 0);
  const down = counts.reduce((sum, c) => sum + c.down, 0);
  const rangeName = recent ? 'Last 30 days' : 'Overall';

  const choose = (showRecent: boolean) => {
    setRecent(showRecent);
    setPicked(null);
  };
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {picked ? barName(picked, period) : 'Reviews over time'}
        </Text>
        {[false, true].map((showRecent) => (
          <Pressable
            key={String(showRecent)}
            onPress={() => choose(showRecent)}
            accessibilityRole="tab"
            accessibilityState={{ selected: recent === showRecent }}
            hitSlop={8}
            style={[styles.range, recent === showRecent && styles.rangeShown]}
          >
            <Text
              style={[
                styles.rangeText,
                recent === showRecent && styles.rangeTextShown,
              ]}
            >
              {showRecent ? '30 days' : 'Overall'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        style={styles.bars}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={`Reviews over time, ${rangeName}: ${up.toLocaleString()} recommended, ${down.toLocaleString()} not recommended`}
      >
        {width > 0 &&
          bars.map((bar) => (
            <Pressable
              key={bar.at}
              onPress={() => setPicked(picked?.at === bar.at ? null : bar)}
              style={[
                styles.bar,
                picked && picked.at !== bar.at && styles.dimmed,
              ]}
            >
              <View style={[styles.upSide, { height: maxUp * scale }]}>
                <View style={[styles.up, { height: bar.up * scale }]} />
              </View>
              <View style={{ height: maxDown * scale }}>
                <View style={[styles.down, { height: bar.down * scale }]} />
              </View>
            </Pressable>
          ))}
        <View style={[styles.zero, { top: maxUp * scale }]} />
      </View>
      <View style={styles.dates}>
        <Text style={styles.date}>{periodName(counts[0].at, period)}</Text>
        <Text style={styles.date}>
          {periodName(counts[counts.length - 1].at, period)}
        </Text>
      </View>
      <Legend up={picked ? picked.up : up} down={picked ? picked.down : down} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, color: colors.bright, fontSize: 14, fontWeight: '600' },
  range: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  rangeShown: { backgroundColor: colors.accentBackground },
  rangeText: { color: colors.muted, fontSize: 13 },
  rangeTextShown: { color: colors.accent, fontWeight: '600' },
  bars: { flexDirection: 'row', gap: GAP, height: HEIGHT },
  bar: { flex: 1 },
  dimmed: { opacity: 0.4 },
  upSide: { justifyContent: 'flex-end' },
  // rounded at the ends away from the line
  up: {
    backgroundColor: colors.chartPositive,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  down: {
    backgroundColor: colors.chartNegative,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  zero: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dates: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { color: colors.muted, fontSize: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: colors.text, fontSize: 13 },
});
