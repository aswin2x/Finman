/**
 * Welcome and sign-in.
 *
 * A slow ember glow drifts behind the content. It is the only continuous
 * animation in the app, it runs on one screen, and it stops entirely when
 * reduced motion is on.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { TextField } from '../src/components/fields';
import { Gradient, diagonal } from '../src/components/Gradient';
import { Button } from '../src/components/primitives';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { useReducedMotion } from '../src/lib/motion';
import { gradients, motion, palette, radius, spacing, typography } from '../src/theme';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { status, signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const glow = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    glow.value = withRepeat(
      withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [glow, reduced]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + glow.value * 0.35,
    transform: [{ scale: 1 + glow.value * 0.12 }, { translateY: glow.value * -18 }],
  }));

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  if (status === 'authenticated') return <Redirect href="/(tabs)" />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(values.username, values.password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.isNetwork
            ? 'Cannot reach the server. Check that the backend is running.'
            : err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <View style={styles.root}>
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
        <Gradient
          colors={['rgba(255,138,91,0.5)', 'rgba(232,69,47,0.05)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.slow)}>
            <View style={styles.mark}>
              <Gradient colors={gradients.ember} {...diagonal} style={styles.markInner}>
                <Text style={styles.markText}>F</Text>
              </Gradient>
            </View>
          </Animated.View>

          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.slow).delay(120)}>
            <Text style={[typography.display, styles.headline]}>Your finances.</Text>
            <Text style={[typography.display, styles.headlineAccent]}>Simplified.</Text>
            <Text style={[typography.body, styles.tagline]}>
              Track spending. Manage commitments. Plan ahead.
            </Text>
          </Animated.View>

          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(motion.slow).delay(220)}
            style={styles.form}
          >
            <TextField
              control={control}
              name="username"
              label="Username"
              placeholder="aswin"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              returnKeyType="next"
            />
            <TextField
              control={control}
              name="password"
              label="Password"
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />

            {error ? (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Text style={[typography.caption, { color: palette.negative }]}>{error}</Text>
              </View>
            ) : null}

            <Button label="Log in" onPress={onSubmit} loading={submitting} full style={{ marginTop: spacing.xs }} />
          </Animated.View>

          <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.slow).delay(400)}>
            <Text style={styles.footnote}>
              A private household ledger for Aswin and Salini. Shared entries are visible to both of you;
              personal entries stay with whoever recorded them.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  glow: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
    overflow: 'hidden',
  },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: spacing.xl },
  mark: { width: 60, height: 60, borderRadius: radius.lg, overflow: 'hidden' },
  markInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markText: { ...typography.title, color: palette.white, fontWeight: '800' },
  headline: { color: palette.textPrimary },
  headlineAccent: { color: palette.ember },
  tagline: { color: palette.textSecondary, marginTop: spacing.md, maxWidth: 300 },
  form: { gap: spacing.md },
  error: {
    backgroundColor: palette.negativeSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,90,90,0.3)',
  },
  footnote: { ...typography.caption, color: palette.textTertiary, lineHeight: 19 },
});
