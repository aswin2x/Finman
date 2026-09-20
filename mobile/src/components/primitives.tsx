/**
 * Shared building blocks.
 *
 * Surfaces are white and separated by hairlines rather than fills or shadows.
 * Black is the only accent, reserved for the primary action on a screen.
 */
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

import { Icon, type IconName } from './Icon';
import { haptics, useReducedMotion } from '../lib/motion';
import { motion, palette, radius, shadow, spacing, typography } from '../theme';

/* ----------------------------------------------------------------- surfaces */

interface CardProps extends ViewProps {
  children: React.ReactNode;
  padded?: boolean;
  /** Lifts the card off the page. Used once per screen at most. */
  raised?: boolean;
  /** A quiet filled block, for secondary information. */
  subtle?: boolean;
  index?: number;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, padded = true, raised = false, subtle = false, index, style, ...rest }: CardProps) {
  const reduced = useReducedMotion();
  const entering =
    index === undefined || reduced
      ? undefined
      : FadeInDown.duration(motion.base).delay(Math.min(index * motion.stagger, 220));

  return (
    <Animated.View
      entering={entering}
      style={[
        styles.card,
        subtle && styles.cardSubtle,
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

/** An inverted block. Reserved for the single headline figure on a screen. */
export function FeatureCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.feature, style]}>{children}</View>;
}

/** A plain horizontal rule. */
export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  return <View style={[styles.divider, inset ? { marginLeft: inset } : null, style]} />;
}

/* ------------------------------------------------------------------ buttons */

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: IconName;
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

  const heights = { sm: 36, md: 48, lg: 54 };
  const inverted = variant === 'primary';
  const tint = inverted ? palette.inkInverse : palette.ink;

  return (
    <Animated.View style={[animated, full && { width: '100%' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={label}
        disabled={isDisabled}
        onPressIn={() => {
          if (!reduced) scale.value = withSpring(0.975, motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
        }}
        onPress={(event) => {
          haptics.tap();
          onPress?.(event);
        }}
        style={({ pressed }) => [
          styles.button,
          { height: heights[size] },
          inverted && styles.buttonPrimary,
          variant === 'secondary' && styles.buttonSecondary,
          variant === 'ghost' && styles.buttonGhost,
          variant === 'danger' && styles.buttonDanger,
          pressed && inverted && { backgroundColor: palette.accentPressed },
          pressed && !inverted && { backgroundColor: palette.surfaceSunken },
          isDisabled && { opacity: 0.4 },
          style,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={tint} size="small" />
        ) : (
          <View style={styles.buttonInner}>
            {icon ? <Icon name={icon} size={16} color={tint} style={{ marginRight: spacing.xs }} /> : null}
            <Text
              style={[
                size === 'sm' ? typography.captionMedium : typography.bodyMedium,
                { color: tint },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** A square icon-only control, for back and close. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  bordered = true,
}: {
  name: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  bordered?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        bordered && styles.iconButtonBordered,
        pressed && { backgroundColor: palette.surfaceSunken },
      ]}
    >
      <Icon name={name} size={18} color={palette.ink} />
    </Pressable>
  );
}

/** A row that scales slightly on touch. */
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
          if (!reduced) scale.value = withSpring(0.99, motion.spring);
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
        style={({ pressed }) => [pressed && { backgroundColor: palette.surfaceSubtle }, style]}
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
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        haptics.select();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && !active && { backgroundColor: palette.surfaceSunken },
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={13}
          color={active ? palette.inkInverse : palette.inkSecondary}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        style={[typography.captionMedium, { color: active ? palette.inkInverse : palette.inkSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A quiet status marker. Outlined, never filled with colour. */
export function Pill({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <View style={[styles.pill, strong && styles.pillStrong]}>
      <Text
        style={[
          typography.label,
          { color: strong ? palette.inkInverse : palette.inkTertiary, textTransform: 'uppercase' },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/* ----------------------------------------------------------------- headings */

export function SectionHeading({
  title,
  action,
  onAction,
  caption,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  caption?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeading, style]}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.label, { color: palette.inkTertiary, textTransform: 'uppercase' }]}>
          {title}
        </Text>
        {caption ? (
          <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 4 }]}>{caption}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptics.tap();
            onAction?.();
          }}
          hitSlop={10}
          style={styles.sectionAction}
        >
          <Text style={[typography.captionMedium, { color: palette.ink }]}>{action}</Text>
          <Icon name="chevron" size={14} color={palette.ink} style={{ marginLeft: 2 }} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A label above a figure, the pattern every metric on the app uses. */
export function Metric({
  label,
  value,
  caption,
  align = 'left',
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text style={[typography.label, { color: palette.inkTertiary, textTransform: 'uppercase' }]}>
        {label}
      </Text>
      <View style={{ marginTop: 6 }}>{value}</View>
      {caption ? (
        <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 3 }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------- states */

export function Skeleton({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: number | string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.55);

  React.useEffect(() => {
    if (reduced) return;
    const tick = () => {
      opacity.value = withTiming(opacity.value > 0.7 ? 0.5 : 0.9, { duration: 650 });
    };
    tick();
    const timer = setInterval(tick, 650);
    return () => clearInterval(timer);
  }, [opacity, reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: reduced ? 0.6 : opacity.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          height,
          width: width as ViewStyle['width'],
          borderRadius: radius.sm,
          backgroundColor: palette.surfaceSunken,
        },
        animated,
        style,
      ]}
    />
  );
}

export function EmptyState({
  title,
  message,
  action,
  onAction,
  icon = 'info',
}: {
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
  icon?: IconName;
}) {
  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={20} color={palette.inkTertiary} />
      </View>
      <Text style={[typography.subheading, { color: palette.ink, marginTop: spacing.md }]}>{title}</Text>
      <Text
        style={[
          typography.body,
          { color: palette.inkTertiary, textAlign: 'center', marginTop: 6, maxWidth: 280 },
        ]}
      >
        {message}
      </Text>
      {action ? (
        <Button label={action} variant="secondary" size="sm" onPress={onAction} style={{ marginTop: spacing.lg }} />
      ) : null}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="alert" size={20} color={palette.ink} />
      </View>
      <Text style={[typography.subheading, { color: palette.ink, marginTop: spacing.md }]}>
        Could not load
      </Text>
      <Text
        style={[
          typography.body,
          { color: palette.inkTertiary, textAlign: 'center', marginTop: 6, maxWidth: 280 },
        ]}
      >
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

/** Shown when the figures on screen come from seeded sample records. */
export function DemoBanner() {
  return (
    <View style={styles.notice}>
      <Icon name="info" size={14} color={palette.inkTertiary} />
      <Text style={[typography.caption, { color: palette.inkSecondary, flex: 1, marginLeft: spacing.xs }]}>
        Sample data. These figures come from the demo records, not your own entries.
      </Text>
    </View>
  );
}

/** A quiet inline note. Carries meaning in words, never in tone. */
export function Notice({ children, icon = 'info' }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <View style={styles.notice}>
      <Icon name={icon} size={14} color={palette.inkTertiary} />
      <Text style={[typography.caption, { color: palette.inkSecondary, flex: 1, marginLeft: spacing.xs }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  cardSubtle: { backgroundColor: palette.surfaceSubtle, borderColor: palette.border },
  cardRaised: { ...shadow.raised, borderColor: palette.border },
  feature: {
    backgroundColor: palette.surfaceInverse,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  button: {
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: palette.accent },
  buttonSecondary: {
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  buttonGhost: { backgroundColor: palette.transparent },
  buttonDanger: {
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  iconButtonBordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
    alignSelf: 'flex-start',
  },
  pillStrong: { backgroundColor: palette.accent, borderColor: palette.accent },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionAction: { flexDirection: 'row', alignItems: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceSunken,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.surfaceSubtle,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
});
