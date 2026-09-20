/**
 * Welcome and sign-in.
 *
 * A quiet first screen: the product statement, two fields, one action. No
 * ornament, because the only thing to do here is get past it.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { TextField } from '../src/components/fields';
import { Button, Notice } from '../src/components/primitives';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { useReducedMotion } from '../src/lib/motion';
import { motion, palette, radius, spacing, typography } from '../src/theme';

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
              <Text style={styles.markText}>F</Text>
            </View>
          </Animated.View>

          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.slow).delay(80)}>
            <Text style={styles.headline}>Your finances,</Text>
            <Text style={styles.headline}>simplified.</Text>
            <Text style={styles.tagline}>Track spending. Manage commitments. Plan ahead.</Text>
          </Animated.View>

          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(motion.slow).delay(160)}
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

            {error ? <Notice icon="alert">{error}</Notice> : null}

            <Button label="Log in" onPress={onSubmit} loading={submitting} full style={{ marginTop: spacing.xs }} />
          </Animated.View>

          <View style={{ flex: 1 }} />

          <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.slow).delay(320)}>
            <Text style={styles.footnote}>
              A private ledger for two. Shared entries appear for both of you; personal entries stay with
              whoever recorded them.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  mark: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceInverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { ...typography.heading, color: palette.inkInverse },
  headline: { ...typography.display, fontSize: 36, lineHeight: 42, color: palette.ink },
  tagline: { ...typography.body, color: palette.inkTertiary, marginTop: spacing.md, maxWidth: 300 },
  form: { gap: spacing.md },
  footnote: { ...typography.caption, color: palette.inkQuaternary, lineHeight: 19 },
});
