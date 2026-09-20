/** Progress bars and the category breakdown, both in ordered grayscale. */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { formatCurrency, formatPercent } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import type { CategoryTotal } from '../lib/types';
import { motion, palette, radius, rampAt, spacing, typography } from '../theme';

interface ProgressProps {
  /** 0 to 100 and beyond. Clamped visually, reported honestly. */
  percent: number;
  fill?: string;
  height?: number;
  delay?: number;
  track?: string;
}

export function ProgressBar({ percent, fill, height = 4, delay = 0, track }: ProgressProps) {
  const reduced = useReducedMotion();
  const width = useSharedValue(0);
  const clamped = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    if (reduced) {
      width.value = clamped;
      return;
    }
    width.value = withDelay(
      delay,
      withTiming(clamped, { duration: motion.slow, easing: Easing.out(Easing.cubic) }),
    );
  }, [clamped, reduced, width, delay]);

  const animated = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      style={[styles.track, { height, backgroundColor: track ?? palette.surfaceSunken }]}
    >
      <Animated.View
        style={[{ height, borderRadius: radius.pill, backgroundColor: fill ?? palette.ink }, animated]}
      />
    </View>
  );
}

/**
 * Category spending, ordered largest first with the darkest shade. Rank is
 * carried by order and weight, so no hue is needed to read the breakdown.
 */
export function CategoryBreakdown({
  items,
  max = 6,
  showAmounts = true,
}: {
  items: CategoryTotal[];
  max?: number;
  showAmounts?: boolean;
}) {
  const shown = items.slice(0, max);
  const top = shown[0]?.amount ?? 0;

  if (shown.length === 0) {
    return (
      <Text style={[typography.caption, { color: palette.inkTertiary }]}>
        No spending recorded in this period.
      </Text>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {shown.map((item, index) => (
        <View key={item.category_id ?? `uncategorised-${index}`}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.swatch, { backgroundColor: rampAt(index) }]} />
              <Text
                style={[
                  index === 0 ? typography.bodyMedium : typography.body,
                  { color: palette.ink, flexShrink: 1 },
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </View>
            {showAmounts ? (
              <Text style={[typography.figureSmall, { color: palette.ink }]}>
                {formatCurrency(item.amount)}
              </Text>
            ) : null}
          </View>

          <View style={styles.barRow}>
            <ProgressBar
              percent={top > 0 ? (item.amount / top) * 100 : 0}
              fill={rampAt(index)}
              height={3}
              delay={index * motion.stagger}
            />
            <Text style={[typography.caption, { color: palette.inkQuaternary, marginLeft: spacing.sm }]}>
              {formatPercent(item.share_pct, 0)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, borderRadius: radius.pill, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm },
  swatch: { width: 8, height: 8, borderRadius: 2, marginRight: spacing.xs },
  barRow: { flexDirection: 'row', alignItems: 'center' },
});
