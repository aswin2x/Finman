/** Profile, categories, recurring entries and sign-out. */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gradient } from '../src/components/Gradient';
import { ImportExportSheet } from '../src/components/ImportExportSheet';
import { RecurringSheet } from '../src/components/RecurringSheet';
import {
  Button,
  Card,
  Divider,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../src/components/primitives';
import { ConfirmDialog } from '../src/components/Sheet';
import { BASE_URL } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { formatCurrency, formatDate, initials, titleCase } from '../src/lib/format';
import { useReducedMotion } from '../src/lib/motion';
import { useCategories, useDeleteRecurring, useHousehold, useRecurring } from '../src/lib/queries';
import { useToast } from '../src/lib/toast';
import type { RecurringRule } from '../src/lib/types';
import { gradients, motion, palette, radius, spacing, typography } from '../src/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const reduced = useReducedMotion();
  const { user, signOut } = useAuth();

  const { data: household = [] } = useHousehold();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const { data: recurring = [] } = useRecurring(false);
  const removeRecurring = useDeleteRecurring();

  const [portingOpen, setPortingOpen] = useState(false);
  const [recurringSheet, setRecurringSheet] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmRule, setConfirmRule] = useState<string | null>(null);

  const expenseCategories = categories.filter((category) => category.kind === 'expense');
  const incomeCategories = categories.filter((category) => category.kind === 'income');

  const onSignOut = async () => {
    setConfirmSignOut(false);
    await signOut();
    router.replace('/login');
  };

  const onDeleteRule = async () => {
    if (!confirmRule) return;
    try {
      await removeRecurring.mutateAsync(confirmRule);
      setConfirmRule(null);
      toast.show('Recurring entry removed');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not remove', { tone: 'error' });
    }
  };

  return (
    <View style={styles.root}>
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navBar}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Go back">
            <View style={styles.backButton}>
              <Text style={[typography.body, { color: palette.textPrimary }]}>Back</Text>
            </View>
          </PressableScale>
        </View>

        {/* Profile */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Card raised>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { borderColor: user?.avatar_color ?? palette.ember }]}>
                <Text style={[typography.heading, { color: palette.textPrimary }]}>
                  {initials(user?.display_name ?? '')}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.heading, { color: palette.textPrimary }]}>
                  {user?.display_name}
                </Text>
                <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
                  Signed in as {user?.username}
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        {/* Household */}
        <View>
          <SectionHeading title="Household" caption="Shared records are visible to both members" />
          <Card padded={false}>
            {household.map((member, index) => (
              <View
                key={member.id}
                style={[styles.memberRow, index < household.length - 1 && styles.rowBorder]}
              >
                <View style={[styles.memberDot, { backgroundColor: member.avatar_color }]} />
                <Text style={[typography.body, { color: palette.textPrimary, flex: 1 }]}>
                  {member.display_name}
                </Text>
                {member.id === user?.id ? <Pill label="You" color={palette.ember} /> : null}
              </View>
            ))}
          </Card>
        </View>

        {/* Recurring */}
        <View>
          <SectionHeading
            title="Recurring entries"
            action="Add"
            onAction={() => {
              setEditingRule(null);
              setRecurringSheet(true);
            }}
            caption="Salary, rent and subscriptions used for upcoming payments and forecasts"
          />
          <Card padded={false}>
            {recurring.length === 0 ? (
              <View style={{ padding: spacing.lg }}>
                <Text style={[typography.caption, { color: palette.textTertiary }]}>
                  None yet. Adding your salary and fixed costs improves the forecast.
                </Text>
              </View>
            ) : (
              recurring.map((rule, index) => (
                <PressableScale
                  key={rule.id}
                  onPress={() => {
                    setEditingRule(rule);
                    setRecurringSheet(true);
                  }}
                  onLongPress={() => setConfirmRule(rule.id)}
                  accessibilityLabel={`${rule.title}, ${formatCurrency(rule.amount)}`}
                  accessibilityHint="Tap to edit, press and hold to remove"
                >
                  <View style={[styles.ruleRow, index < recurring.length - 1 && styles.rowBorder]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text style={[typography.body, { color: palette.textPrimary }]} numberOfLines={1}>
                          {rule.title}
                        </Text>
                        {!rule.is_active ? <Pill label="Paused" color={palette.neutral} /> : null}
                        {rule.auto_post ? <Pill label="Auto" color={palette.info} /> : null}
                      </View>
                      <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                        {titleCase(rule.frequency)} · next {formatDate(rule.next_run_on)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        typography.bodyStrong,
                        { color: rule.type === 'income' ? palette.positive : palette.textPrimary },
                      ]}
                    >
                      {rule.type === 'income' ? '+' : ''}
                      {formatCurrency(rule.amount)}
                    </Text>
                  </View>
                </PressableScale>
              ))
            )}
          </Card>
        </View>

        {/* Categories */}
        <View>
          <SectionHeading title="Categories" caption={`${categories.length} in use`} />
          <Card>
            {categoriesLoading ? (
              <Skeleton height={60} />
            ) : (
              <>
                <Text style={[typography.micro, { color: palette.textTertiary }]}>EXPENSE</Text>
                <View style={styles.categoryWrap}>
                  {expenseCategories.map((category) => (
                    <View key={category.id} style={styles.categoryChip}>
                      <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                      <Text style={[typography.caption, { color: palette.textSecondary }]}>{category.name}</Text>
                    </View>
                  ))}
                </View>
                <Divider style={{ marginVertical: spacing.md }} />
                <Text style={[typography.micro, { color: palette.textTertiary }]}>INCOME</Text>
                <View style={styles.categoryWrap}>
                  {incomeCategories.map((category) => (
                    <View key={category.id} style={styles.categoryChip}>
                      <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                      <Text style={[typography.caption, { color: palette.textSecondary }]}>{category.name}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: spacing.md }]}>
                  New categories are created automatically when you import a file with unfamiliar names.
                </Text>
              </>
            )}
          </Card>
        </View>

        {/* Data */}
        <View>
          <SectionHeading title="Data" />
          <View style={{ gap: spacing.sm }}>
            <Button label="Import or export records" variant="secondary" onPress={() => setPortingOpen(true)} full />
            <Button label="Sign out" variant="danger" onPress={() => setConfirmSignOut(true)} full />
          </View>
        </View>

        <Text style={[typography.micro, { color: palette.textTertiary, textAlign: 'center' }]}>
          Finman 1.0.0 · connected to {BASE_URL}
        </Text>
      </ScrollView>

      <ImportExportSheet visible={portingOpen} onClose={() => setPortingOpen(false)} />
      <RecurringSheet
        visible={recurringSheet}
        onClose={() => setRecurringSheet(false)}
        editing={editingRule}
      />

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="Your records stay on the server. You will need your password to sign back in."
        confirmLabel="Sign out"
        onConfirm={onSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />

      <ConfirmDialog
        visible={confirmRule !== null}
        title="Remove this recurring entry?"
        message="Entries it has already created stay in your ledger."
        confirmLabel="Remove"
        onConfirm={onDeleteRule}
        onCancel={() => setConfirmRule(null)}
        loading={removeRecurring.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  navBar: { flexDirection: 'row' },
  backButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    backgroundColor: palette.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  memberDot: { width: 10, height: 10, borderRadius: 5 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceHigh,
  },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
});
