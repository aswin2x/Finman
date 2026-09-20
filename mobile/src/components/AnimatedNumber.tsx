/**
 * A number that counts up to its value when it changes.
 *
 * The animation is cosmetic only: the value shown at rest is always exactly
 * what the server returned. With reduced motion enabled it snaps instantly.
 */
import React, { useEffect, useState } from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { formatCompact, formatCurrency } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import { motion } from '../theme';

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  format?: 'currency' | 'compact' | 'plain' | 'percent';
  decimals?: boolean;
  duration?: number;
  prefix?: string;
  suffix?: string;
}

export function AnimatedNumber({
  value,
  style,
  format = 'currency',
  decimals = false,
  duration = motion.counter,
  prefix = '',
  suffix = '',
}: Props) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduced) {
      progress.value = value;
      setDisplay(value);
      return;
    }
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, reduced, duration, progress]);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(setDisplay)(current);
    },
    [],
  );

  const shown = reduced ? value : display;
  const text =
    format === 'currency'
      ? formatCurrency(shown, { decimals })
      : format === 'compact'
        ? formatCompact(shown)
        : format === 'percent'
          ? `${Math.round(shown)}%`
          : Math.round(shown).toString();

  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {prefix}
      {text}
      {suffix}
    </Text>
  );
}

export const AnimatedText = Animated.createAnimatedComponent(Text);
