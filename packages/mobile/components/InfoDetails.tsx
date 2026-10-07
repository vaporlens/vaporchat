import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SectionTitle } from './SectionTitle';

export interface Section {
  label?: string;
  text?: string;
  /** numbers in tiles, two to a row */
  tiles?: { label: string; value: string }[];
}

/** A sheet's text and titled sections under it, leaving out the empty ones. */
export function InfoDetails({
  lead,
  sections,
}: {
  lead?: string;
  sections: Section[];
}) {
  return (
    <View style={styles.details}>
      {lead ? <Text style={styles.lead}>{lead}</Text> : null}
      {sections.map(({ label, text, tiles }, index) =>
        text?.length || tiles?.length ? (
          <View key={label ?? index} style={styles.section}>
            {label && <SectionTitle title={label} />}
            {text ? <Text style={styles.text}>{text}</Text> : null}
            {tiles?.length ? (
              <View style={styles.tiles}>
                {tiles.map((tile) => (
                  <View key={tile.label} style={styles.tile}>
                    <Text style={styles.tileLabel}>{tile.label}</Text>
                    <Text style={styles.tileValue}>{tile.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: 16 },
  lead: { color: colors.bright, fontSize: 15, lineHeight: 22 },
  section: { gap: 4 },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    gap: 2,
    padding: 10,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
  },
  tileLabel: { color: colors.muted, fontSize: 12 },
  tileValue: { color: colors.bright, fontSize: 15, fontWeight: '600' },
});
