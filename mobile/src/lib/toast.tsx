/**
 * Lightweight toast with an optional undo action.
 *
 * Used to confirm saves and to offer a way back from a deletion without a
 * second confirmation step.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { haptics } from './motion';
import { palette, radius, shadow, spacing, typography } from '../theme';

type Tone = 'success' | 'error' | 'info';

interface ToastOptions {
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

interface ToastState extends ToastOptions {
  message: string;
  id: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      if (timer.current) clearTimeout(timer.current);
      const tone = options.tone ?? 'success';
      if (tone === 'success') haptics.success();
      else if (tone === 'error') haptics.error();

      setToast({ message, id: Date.now(), ...options, tone });
      timer.current = setTimeout(dismiss, options.duration ?? (options.actionLabel ? 5200 : 2600));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  // One surface for every tone; the message carries the meaning.
  const toneIcon = toast?.tone === 'error' ? 'alert' : toast?.tone === 'info' ? 'info' : 'check';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + 92 }]}
        >
          <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Icon name={toneIcon} size={15} color={palette.inkInverse} />
            <Text style={[typography.caption, { color: palette.inkInverse, flex: 1 }]} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  haptics.tap();
                  toast.onAction?.();
                  dismiss();
                }}
              >
                <Text style={[typography.captionMedium, { color: palette.inkInverse, textDecorationLine: 'underline' }]}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surfaceInverse,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    width: '100%',
    ...shadow.raised,
  },
});
