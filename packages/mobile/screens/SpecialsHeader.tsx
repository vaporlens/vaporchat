import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactElement, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SpecialsFilter, SpecialsSort } from 'vaporchat/protocol';
import { InfoSheet } from '../components/InfoSheet';
import { colors } from '../theme';

/** A filter's value, its short text on the chip and its full text in the sheet. */
interface Choice<V> {
  value: V;
  chip: string;
  label: string;
}

const DISCOUNTS: Choice<number>[] = [
  { value: 0, chip: 'Discount', label: 'Any discount' },
  { value: 50, chip: '50%+ off', label: '50% off or more' },
  { value: 75, chip: '75%+ off', label: '75% off or more' },
  { value: 90, chip: '90%+ off', label: '90% off or more' },
];

// EUserReviewScore
const REVIEW_SCORES: Choice<number>[] = [
  { value: 0, chip: 'Reviews', label: 'Any reviews' },
  { value: 7, chip: 'Positive+', label: 'Positive or better' },
  { value: 8, chip: 'Very Positive+', label: 'Very Positive or better' },
  { value: 9, chip: 'Overwhelming', label: 'Overwhelmingly Positive' },
];

const SORTS: Choice<SpecialsSort>[] = [
  { value: 'topSellers', chip: 'Best selling', label: 'Best selling' },
  { value: 'reviews', chip: 'Best reviewed', label: 'Best reviewed' },
  { value: 'trending', chip: 'New & trending', label: 'New & trending' },
];

/**
 * A chip showing a filter's value, opening a sheet to pick another. Highlighted off the first
 * choice, which lets everything through.
 */
function Dropdown<V extends string | number>({
  title,
  choices,
  value,
  onChange,
}: {
  title: string;
  choices: Choice<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = choices.find((choice) => choice.value === value)!;
  const narrowed = value !== choices[0].value;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${picked.label}`}
        style={({ pressed }) => [
          styles.chip,
          narrowed && styles.narrowed,
          pressed && styles.pressed,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.chipText, narrowed && styles.narrowedText]}
        >
          {picked.chip}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={narrowed ? colors.accent : colors.muted}
        />
      </Pressable>
      <InfoSheet
        info={
          open
            ? {
                title,
                body: (
                  <View style={styles.list}>
                    {choices.map((choice) => (
                      <Pressable
                        key={choice.value}
                        onPress={() => {
                          setOpen(false);
                          if (choice.value !== value) onChange(choice.value);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: choice === picked }}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.label}>{choice.label}</Text>
                        {choice === picked && (
                          <Ionicons
                            name="checkmark"
                            size={22}
                            color={colors.accent}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                ),
              }
            : null
        }
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Over the Discounted list: the tab's pills, then how much off, how well reviewed and the sort. */
export function SpecialsHeader({
  header,
  filter,
  onFilter,
}: {
  header: ReactElement;
  filter: SpecialsFilter;
  onFilter: (filter: SpecialsFilter) => void;
}) {
  return (
    <>
      {header}
      <View style={styles.bar}>
        <Dropdown
          title="Discount"
          choices={DISCOUNTS}
          value={filter.minDiscount}
          onChange={(minDiscount) => onFilter({ ...filter, minDiscount })}
        />
        <Dropdown
          title="Reviews"
          choices={REVIEW_SCORES}
          value={filter.minReviewScore}
          onChange={(minReviewScore) => onFilter({ ...filter, minReviewScore })}
        />
        <Dropdown
          title="Sort"
          choices={SORTS}
          value={filter.sort}
          onChange={(sort) => onFilter({ ...filter, sort })}
        />
      </View>
    </>
  );
}

// the chips like SubTabs' pills, sharing the row instead of scrolling
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  // as wide as their text, a long one taking from the others
  chip: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  narrowed: { backgroundColor: colors.accentBackground },
  pressed: { opacity: 0.7 },
  chipText: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  narrowedText: { color: colors.accent },
  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  label: { flex: 1, color: colors.bright, fontSize: 16 },
});
