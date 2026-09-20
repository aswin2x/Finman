/**
 * Bottom sheet used for quick entry and short edits.
 *
 * Built directly on Modal plus Reanimated rather than a gesture library so the
 * dismiss behaviour stays predictable on both platforms, and so the keyboard
 * never covers the amount field.
 */
import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../lib/motion';
import { motion, palette, radius, shadow, spacing, typography } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Full-height presentation for longer forms. */
  tall?: boolean;
}

export function Sheet({ visible, onClose, title, subtitle, children, footer, tall = false }: Props) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      progress.value = visible ? 1 : 0;
      return;
    }
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? motion.base : motion.fast,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, reduced, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 420 }],
    opacity: reduced ? 1 : Math.min(1, progress.value * 1.4),
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              tall && { maxHeight: '92%', minHeight: '70%' },
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              sheetStyle,
            ]}
          >
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={[typography.heading, { color: palette.ink }]}>{title}</Text>
              {subtitle ? (
                <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>{subtitle}</Text>
              ) : null}
            </View>

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** A confirmation dialog for destructive actions. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
  loading = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.dialogRoot} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}>
          <Text style={[typography.subheading, { color: palette.ink }]}>{title}</Text>
          <Text style={[typography.body, { color: palette.inkSecondary, marginTop: spacing.xs }]}>{message}</Text>
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.dialogButton, { backgroundColor: palette.surfaceSunken }]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[typography.bodyMedium, { color: palette.ink }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.dialogButton, styles.dialogButtonPrimary]}
              onPress={onConfirm}
              disabled={loading}
            >
              <Text
                style={[typography.bodyMedium, { color: palette.inkInverse }]}
              >
                {loading ? 'Working...' : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.page,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    maxHeight: '88%',
    ...shadow.sheet,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.borderStrong,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    gap: spacing.sm,
  },
  dialogRoot: {
    flex: 1,
    backgroundColor: palette.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  dialogButton: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dialogButtonPrimary: { backgroundColor: palette.ink },
});
