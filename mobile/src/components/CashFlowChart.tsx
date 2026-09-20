/**
 * Cash-flow chart.
 *
 * A single thin ink line over a faint fill. Touching it scrubs a marker and
 * reports the exact value under the finger, so figures are read rather than
 * estimated from the shape.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { formatCompact, formatCurrency, formatDateShort } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import type { CashFlowPoint } from '../lib/types';
import { motion, palette, radius, spacing, typography } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  points: CashFlowPoint[];
  height?: number;
  showAxis?: boolean;
}

/** Catmull-Rom to cubic Bezier: a smooth line that never overshoots its data. */
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${
      p2.x - (p3.x - p1.x) / 6
    } ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
}

export function CashFlowChart({ points, height = 150, showAxis = true }: Props) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length === 0 || width === 0) return null;
    const padding = { top: 14, bottom: showAxis ? 20 : 6 };
    const innerHeight = height - padding.top - padding.bottom;
    const values = points.map((p) => p.cumulative_net);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.max(Math.abs(max), 1);

    const coords = points.map((point, index) => ({
      x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
      y: padding.top + innerHeight - ((point.cumulative_net - min) / span) * innerHeight,
    }));

    const line = smoothPath(coords);
    const baseline = height - padding.bottom;
    const area = `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`;
    const zeroY =
      min <= 0 && max >= 0 ? padding.top + innerHeight - ((0 - min) / span) * innerHeight : null;

    return { coords, line, area, zeroY, padding, baseline };
  }, [points, width, height, showAxis]);

  const pan = Gesture.Pan()
    .onBegin((event) => {
      if (!chart || points.length === 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / Math.max(width, 1)));
      setActiveIndex(Math.round(ratio * (points.length - 1)));
    })
    .onUpdate((event) => {
      if (!chart || points.length === 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / Math.max(width, 1)));
      setActiveIndex(Math.round(ratio * (points.length - 1)));
    })
    .onFinalize(() => setActiveIndex(null))
    .runOnJS(true);

  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = chart && activeIndex !== null ? chart.coords[activeIndex] : null;
  const last = points[points.length - 1];

  if (points.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={[typography.caption, { color: palette.inkTertiary }]}>
          No activity recorded in this period
        </Text>
      </View>
    );
  }

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.readout}>
        <View>
          <Text style={[typography.label, { color: palette.inkTertiary, textTransform: 'uppercase' }]}>
            {active ? formatDateShort(active.date) : 'Net position'}
          </Text>
          <Text style={[typography.figureSmall, { color: palette.ink, marginTop: 4 }]}>
            {formatCurrency(active ? active.cumulative_net : last.cumulative_net)}
          </Text>
        </View>
        {active ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.mono, { color: palette.inkSecondary }]}>
              In {formatCompact(active.income)}
            </Text>
            <Text style={[typography.mono, { color: palette.inkTertiary, marginTop: 2 }]}>
              Out {formatCompact(active.expenses)}
            </Text>
          </View>
        ) : null}
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={{ height }}
          accessibilityRole="image"
          accessibilityLabel="Cash flow chart. Touch and drag to read values."
        >
          {chart && width > 0 ? (
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={palette.ink} stopOpacity="0.09" />
                  <Stop offset="1" stopColor={palette.ink} stopOpacity="0" />
                </LinearGradient>
              </Defs>

              {chart.zeroY !== null ? (
                <Line
                  x1={0}
                  y1={chart.zeroY}
                  x2={width}
                  y2={chart.zeroY}
                  stroke={palette.borderStrong}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
              ) : null}

              <Path d={chart.area} fill="url(#flowFill)" />
              <AnimatedPath
                entering={reduced ? undefined : FadeIn.duration(motion.slow)}
                d={chart.line}
                stroke={palette.ink}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              {activeCoord ? (
                <>
                  <Line
                    x1={activeCoord.x}
                    y1={chart.padding.top}
                    x2={activeCoord.x}
                    y2={chart.baseline}
                    stroke={palette.borderStrong}
                    strokeWidth={1}
                  />
                  <Circle cx={activeCoord.x} cy={activeCoord.y} r={4.5} fill={palette.page} />
                  <Circle
                    cx={activeCoord.x}
                    cy={activeCoord.y}
                    r={4.5}
                    stroke={palette.ink}
                    strokeWidth={1.75}
                    fill={palette.page}
                  />
                </>
              ) : (
                <Circle
                  cx={chart.coords[chart.coords.length - 1].x - 1}
                  cy={chart.coords[chart.coords.length - 1].y}
                  r={3}
                  fill={palette.ink}
                />
              )}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>

      {showAxis ? (
        <View style={styles.axis}>
          <Text style={[typography.caption, { color: palette.inkQuaternary }]}>{points[0].label}</Text>
          <Text style={[typography.caption, { color: palette.inkQuaternary }]}>
            {points[Math.floor(points.length / 2)]?.label}
          </Text>
          <Text style={[typography.caption, { color: palette.inkQuaternary }]}>{last.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceSubtle,
    borderRadius: radius.md,
  },
});
