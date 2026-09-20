/**
 * Cash-flow line chart.
 *
 * Draws the cumulative net position as a smoothed path over a soft gradient
 * fill. Touching the chart scrubs a marker along the line and reports the
 * value under the finger, so figures can be read exactly rather than guessed.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

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

/** Catmull-Rom to cubic Bezier, for a smooth line without overshoot. */
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

export function CashFlowChart({ points, height = 168, showAxis = true }: Props) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const markerOpacity = useSharedValue(0);

  const chart = useMemo(() => {
    if (points.length === 0 || width === 0) return null;
    const padding = { top: 12, bottom: showAxis ? 22 : 8, left: 0, right: 0 };
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
    const area = `${line} L ${coords[coords.length - 1].x} ${height - padding.bottom} L ${coords[0].x} ${height - padding.bottom} Z`;
    const zeroY =
      min <= 0 && max >= 0 ? padding.top + innerHeight - ((0 - min) / span) * innerHeight : null;

    return { coords, line, area, min, max, zeroY, padding, innerHeight };
  }, [points, width, height, showAxis]);

  const pan = Gesture.Pan()
    .onBegin((event) => {
      if (!chart || points.length === 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / Math.max(width, 1)));
      const index = Math.round(ratio * (points.length - 1));
      markerOpacity.value = withTiming(1, { duration: motion.instant });
      setActiveIndex(index);
    })
    .onUpdate((event) => {
      if (!chart || points.length === 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / Math.max(width, 1)));
      setActiveIndex(Math.round(ratio * (points.length - 1)));
    })
    .onFinalize(() => {
      markerOpacity.value = withTiming(0, { duration: motion.fast });
      setActiveIndex(null);
    })
    .runOnJS(true);

  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = chart && activeIndex !== null ? chart.coords[activeIndex] : null;

  if (points.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={[typography.caption, { color: palette.textTertiary }]}>
          No activity recorded for this period yet
        </Text>
      </View>
    );
  }

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.readout}>
        <View>
          <Text style={[typography.micro, { color: palette.textTertiary }]}>
            {active ? formatDateShort(active.date) : 'NET POSITION'}
          </Text>
          <Text style={[typography.subheading, { color: palette.textPrimary, marginTop: 2 }]}>
            {formatCurrency(active ? active.cumulative_net : points[points.length - 1].cumulative_net)}
          </Text>
        </View>
        {active ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.micro, { color: palette.positive }]}>
              IN {formatCompact(active.income)}
            </Text>
            <Text style={[typography.micro, { color: palette.negative, marginTop: 2 }]}>
              OUT {formatCompact(active.expenses)}
            </Text>
          </View>
        ) : null}
      </View>

      <GestureDetector gesture={pan}>
        <View style={{ height }} accessibilityRole="image" accessibilityLabel="Cash flow chart. Touch and drag to read values.">
          {chart && width > 0 ? (
            <Svg width={width} height={height}>
              <Defs>
                <SvgGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={palette.ember} stopOpacity="0.28" />
                  <Stop offset="1" stopColor={palette.ember} stopOpacity="0" />
                </SvgGradient>
                <SvgGradient id="flowLine" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={palette.emberBright} />
                  <Stop offset="1" stopColor={palette.emberDeep} />
                </SvgGradient>
              </Defs>

              {chart.zeroY !== null ? (
                <Line
                  x1={0}
                  y1={chart.zeroY}
                  x2={width}
                  y2={chart.zeroY}
                  stroke={palette.hairline}
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
              ) : null}

              <Path d={chart.area} fill="url(#flowFill)" />
              <AnimatedPath
                entering={reduced ? undefined : FadeIn.duration(motion.slow)}
                d={chart.line}
                stroke="url(#flowLine)"
                strokeWidth={2.5}
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
                    y2={height - chart.padding.bottom}
                    stroke={palette.emberGlow}
                    strokeWidth={1}
                  />
                  <Circle cx={activeCoord.x} cy={activeCoord.y} r={6} fill={palette.ember} opacity={0.25} />
                  <Circle cx={activeCoord.x} cy={activeCoord.y} r={3.5} fill={palette.white} />
                </>
              ) : (
                <Circle
                  cx={chart.coords[chart.coords.length - 1].x - 1}
                  cy={chart.coords[chart.coords.length - 1].y}
                  r={3.5}
                  fill={palette.ember}
                />
              )}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>

      {showAxis ? (
        <View style={styles.axis}>
          <Text style={[typography.micro, { color: palette.textTertiary }]}>{points[0].label}</Text>
          <Text style={[typography.micro, { color: palette.textTertiary }]}>
            {points[Math.floor(points.length / 2)]?.label}
          </Text>
          <Text style={[typography.micro, { color: palette.textTertiary }]}>{points[points.length - 1].label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xxs },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.md,
  },
});
