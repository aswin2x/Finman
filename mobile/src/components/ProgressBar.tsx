/** Animated progress bars and the spending-breakdown list. */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Gradient, horizontal } from './Gradient';
import { formatCurrency, formatPercent } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import type { CategoryTotal } from '../lib/types';
import { motion, palette, radius, spacing, stateColor, typography } from '../theme';

interface ProgressProps {
  /** 0 to 100 and beyond; values above 100 are clamped visually but reported honestly. */
  percent: number;
  color?: string;
  gradient?: readonly string[];
  height?: number;
  delay?: number;
  track?: string;
}

export function ProgressBar({ percent, color, gradient, height = 6, delay = 0, track }: ProgressProps) {
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
      style={[styles.track, { height, backgroundColor: track ?? palette.surfaceHigh }]}
    >
      <Animated.View style={[styles.fill, { height }, animated]}>
        {gradient ? (
          <Gradient colors={gradient} {...horizontal} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: color ?? palette.ember }]} />
        )}
      </Animated.View>
    </View>
  );
}

/** A circular gauge used for the headline budget figure. */
export function RingProgress({
  percent,
  size = 96,
  thickness = 8,
  state = 'on_track',
  label,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  state?: string;
  label?: string;
}) {
  const color = stateColor(state);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: palette.surfaceHigh,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: color,
          opacity: 0.25 + (clamped / 100) * 0.75,
        }}
      />
      <Text style={[typography.subheading, { color: palette.textPrimary }]}>{Math.round(percent)}%</Text>
      {label ? <Text style={[typography.micro, { color: palette.textTertiary }]}>{label}</Text> : null}
    </View>
  );
}

/** The category spending breakdown used on the dashboard and expenses screen. */
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
      <Text style={[typography.caption, { color: palette.textTertiary }]}>
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
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={[typography.body, { color: palette.textPrimary }]} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {showAmounts ? (
                <Text style={[typography.bodyStrong, { color: palette.textPrimary }]}>
                  {formatCurrency(item.amount)}
                </Text>
              ) : null}
              <Text style={[typography.micro, { color: palette.textTertiary }]}>
                {formatPercent(item.share_pct, 1)} of spend
              </Text>
            </View>
          </View>
          <ProgressBar
            percent={top > 0 ? (item.amount / top) * 100 : 0}
            color={item.color}
            height={4}
            delay={index * motion.stagger}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  fill: { borderRadius: radius.pill, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.xs },
});
