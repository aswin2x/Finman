/**
 * Motion helpers that respect the OS "reduce motion" setting.
 *
 * When reduced motion is on, entrances become instant and number counters jump
 * straight to their final value. Nothing is hidden or removed, only the
 * movement.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

let cachedPreference = false;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(cachedPreference);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        cachedPreference = value;
        if (mounted) setReduced(value);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      cachedPreference = value;
      if (mounted) setReduced(value);
    });
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

/** Staggered entrance delay, capped so long lists never feel slow. */
export function entranceDelay(index: number, step = 45, max = 320): number {
  return Math.min(index * step, max);
}

export const haptics = {
  tap(): void {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  select(): void {
    if (Platform.OS === 'web') return;
    Haptics.selectionAsync().catch(() => undefined);
  },
  success(): void {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  warning(): void {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
  error(): void {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};
