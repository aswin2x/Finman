/** Shared building blocks: surfaces, buttons, chips, headings and states. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type ViewProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Gradient, diagonal } from './Gradient';
import { entranceDelay, haptics, useReducedMotion } from '../lib/motion';
import { gradients, motion, palette, radius, shadow, spacing, typography } from '../theme';

/* ------------------------------------------------------------------ surface */

interface CardProps extends ViewProps {
  children: React.ReactNode;
  padded?: boolean;
  raised?: boolean;
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/** The standard elevated card, with an optional staggered entrance. */
export function Card({ children, padded = true, raised = false, index, style, ...rest }: CardProps) {
  const reduced = useReducedMotion();
  const entering =
    index === undefined || reduced ? undefined : FadeInDown.duration(motion.base).delay(entranceDelay(index));

  return (
    <Animated.View
      entering={entering}
      style={[
        styles.card,
        raised && styles.cardRaised,
        padded && { padding: spacing.lg },
        style,
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

/** A card carrying the ember gradient, reserved for the primary summary. */
export function GradientCard({ children, style, colors }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; colors?: readonly string[] }) {
  return (
    <Gradient colors={colors ?? gradients.ember} {...diagonal} style={[styles.gradientCard, style]}>
      {children}
    </Gradient>
  );
}

/* ------------------------------------------------------------------ buttons */

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  full = false,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const heights = { sm: 38, md: 48, lg: 54 };
  const labelStyle = size === 'sm' ? typography.caption : typography.bodyStrong;

  const body = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? palette.white : palette.textPrimary} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              labelStyle,
              { color: variant === 'primary' ? palette.white : variant === 'danger' ? palette.negative : palette.textPrimary },
              icon ? { marginLeft: spacing.xs } : null,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </>
  );

  return (
    <Animated.View style={[animated, full && { width: '100%' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={label}
        disabled={isDisabled}
        onPressIn={() => {
          if (!reduced) scale.value = withSpring(0.96, motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
        }}
        onPress={(event) => {
          haptics.tap();
          onPress?.(event);
        }}
        style={[
          styles.button,
          { height: heights[size], opacity: isDisabled ? 0.55 : 1 },
          variant === 'secondary' && styles.buttonSecondary,
          variant === 'ghost' && styles.buttonGhost,
          variant === 'danger' && styles.buttonDanger,
          style,
        ]}
        {...rest}
      >
        {variant === 'primary' ? (
          <Gradient colors={gradients.ember} {...diagonal} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={styles.buttonInner}>{body}</View>
      </Pressable>
    </Animated.View>
  );
}

/** A pressable that scales slightly on touch, used for cards and rows. */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        disabled={disabled}
        onPressIn={() => {
          if (!reduced) scale.value = withSpring(0.975, motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
        }}
        onPress={() => {
          haptics.tap();
          onPress?.();
        }}
        onLongPress={() => {
          haptics.select();
          onLongPress?.();
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------- chips */

export function Chip({
  label,
  active = false,
  onPress,
  color,
  compact = false,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  compact?: boolean;
}) {
  const tint = color ?? palette.ember;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        haptics.select();
        onPress?.();
      }}
      style={[
        styles.chip,
        compact && { paddingVertical: 6, paddingHorizontal: spacing.sm },
        active && { backgroundColor: `${tint}22`, borderColor: `${tint}66` },
      ]}
    >
      <Text
        style={[
          typography.caption,
          { color: active ? tint : palette.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A small coloured pill for statuses. */
export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F` }]}>
      <Text style={[typography.micro, { color, textTransform: 'uppercase' }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ headings */

export function SectionHeading({
  title,
  action,
  onAction,
  caption,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  caption?: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.micro, { color: palette.textTertiary, textTransform: 'uppercase' }]}>{title}</Text>
        {caption ? (
          <Text style={[typography.caption, { color: palette.textSecondary, marginTop: 2 }]}>{caption}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptics.tap();
            onAction?.();
          }}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: palette.ember }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------- states */

/** Shimmering placeholder used while first data loads. */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.4);

  React.useEffect(() => {
    if (reduced) return;
    opacity.value = withTiming(0.85, { duration: 700 });
    const timer = setInterval(() => {
      opacity.value = withTiming(opacity.value > 0.6 ? 0.4 : 0.85, { duration: 700 });
    }, 700);
    return () => clearInterval(timer);
  }, [opacity, reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: reduced ? 0.5 : opacity.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[{ height, width: width as ViewStyle['width'], borderRadius: radius.sm, backgroundColor: palette.surfaceHigh }, animated, style]}
    />
  );
}

export function EmptyState({
  title,
  message,
  action,
  onAction,
}: {
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={styles.empty}>
      <View style={styles.emptyDot} />
      <Text style={[typography.subheading, { color: palette.textPrimary, marginTop: spacing.md }]}>{title}</Text>
      <Text style={[typography.body, { color: palette.textTertiary, textAlign: 'center', marginTop: spacing.xs }]}>
        {message}
      </Text>
      {action ? <Button label={action} variant="secondary" size="sm" onPress={onAction} style={{ marginTop: spacing.lg }} /> : null}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={[typography.subheading, { color: palette.textPrimary }]}>Could not load</Text>
      <Text style={[typography.body, { color: palette.textTertiary, textAlign: 'center', marginTop: spacing.xs }]}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

/** A banner shown when the visible figures come from seeded demo records. */
export function DemoBanner() {
  return (
    <View style={styles.demoBanner}>
      <Text style={[typography.caption, { color: palette.warning }]}>
        Demo data. These figures come from the sample records, not your own entries.
      </Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  cardRaised: {
    backgroundColor: palette.surfaceRaised,
    ...shadow.card,
  },
  gradientCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.glow,
  },
  button: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: {
    backgroundColor: palette.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: palette.negativeSoft },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xs,
    alignSelf: 'flex-start',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.emberSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.emberGlow,
  },
  demoBanner: {
    backgroundColor: palette.warningSoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245, 181, 68, 0.3)',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.hairline },
});
