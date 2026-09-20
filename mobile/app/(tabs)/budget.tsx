/**
 * Budgets.
 *
 * Planned against actual for the month on screen. Spending that falls outside
 * every budget is reported separately, so the headline is never mistaken for
 * total spending. Over-budget is said in words, not signalled by colour.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { BudgetSheet } from '../../src/components/BudgetSheet';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Notice,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { addMonths, formatCurrency, formatMonthLong, monthKey, toISODate } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useBudgetOverview, useBudgets, useRollForwardBudgets } from '../../src/lib/queries';
import { useToast } from '../../src/lib/toast';
import type { BudgetProgress } from '../../src/lib/types';
import { fonts, motion, palette, spacing, stateFill, typography } from '../../src/theme';

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const reduced = useReducedMotion();

  const [anchor, setAnchor] = useState(new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetProgress | null>(null);

  const month = monthKey(anchor);
  const { data: overview, isLoading, isError, error, refetch, isRefetching } = useBudgetOverview(month);
  const { data: budgets = [] } = useBudgets(month);
  const rollForward = useRollForwardBudgets();

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (budget: BudgetProgress) => {
    setEditing(budget);
    setSheetOpen(true);
  };

  const onRollForward = async () => {
    const next = addMonths(anchor, 1);
    try {
      const created = await rollForward.mutateAsync({ from: monthKey(anchor), to: monthKey(next) });
      toast.show(
        created.length > 0
          ? `Copied ${created.length} budgets to ${formatMonthLong(toISODate(next))}`
          : `${formatMonthLong(toISODate(next))} already has budgets`,
        { tone: created.length > 0 ? 'success' : 'info' },
      );
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not roll budgets forward', { tone: 'error' });
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.inkTertiary} />
        }
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.ink }]}>Budget</Text>
          <View style={styles.monthNav}>
            <IconButton
              name="back"
              accessibilityLabel="Previous month"
              onPress={() => setAnchor(addMonths(anchor, -1))}
            />
            <Text style={[typography.subheading, { color: palette.ink, flex: 1, textAlign: 'center' }]}>
              {formatMonthLong(toISODate(anchor))}
            </Text>
            <IconButton
              name="forward"
              accessibilityLabel="Next month"
              onPress={() => setAnchor(addMonths(anchor, 1))}
            />
          </View>
        </Animated.View>

        {isLoading && !overview ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={180} />
            <Skeleton height={96} />
            <Skeleton height={96} />
          </View>
        ) : isError && !overview ? (
          <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
        ) : overview ? (
          <>
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(50)}>
              <Card>
                <View style={styles.headlineRow}>
                  <Text style={[typography.label, styles.label]}>SPENT OF BUDGET</Text>
                  {overview.state === 'over' ? <Pill label="Over" strong /> : null}
                  {overview.state === 'warning' ? <Pill label="Close" /> : null}
                </View>

                <AnimatedNumber
                  value={overview.total_spent}
                  style={[typography.display, { color: palette.ink, marginTop: spacing.xs }]}
                />
                <Text style={[typography.body, { color: palette.inkTertiary, marginTop: 2 }]}>
                  of {formatCurrency(overview.total_limit)} planned
                </Text>

                <View style={{ marginTop: spacing.lg }}>
                  <ProgressBar percent={overview.used_pct} fill={stateFill(overview.state)} height={6} />
                  <View style={styles.headlineMeta}>
                    <Text style={[typography.caption, { color: palette.inkTertiary }]}>
                      {Math.round(overview.used_pct)}% used
                    </Text>
                    <Text
                      style={[
                        typography.captionMedium,
                        {
                          color: palette.ink,
                          fontFamily: overview.total_remaining < 0 ? fonts.semibold : fonts.medium,
                        },
                      ]}
                    >
                      {overview.total_remaining < 0
                        ? `${formatCurrency(Math.abs(overview.total_remaining))} over`
                        : `${formatCurrency(overview.total_remaining)} left`}
                    </Text>
                  </View>
                </View>
              </Card>
            </Animated.View>

            {overview.unbudgeted_spend > 0 ? (
              <Notice>
                {formatCurrency(overview.unbudgeted_spend)} was spent in categories with no budget set. It is
                not included in the figure above.
              </Notice>
            ) : null}

            <View>
              <SectionHeading
                title="By category"
                action={budgets.length > 0 ? 'Roll forward' : undefined}
                onAction={onRollForward}
              />

              {budgets.length === 0 ? (
                <EmptyState
                  icon="target"
                  title="No budgets this month"
                  message="Set a limit for a category and track it against what you actually spend."
                  action="Create a budget"
                  onAction={openNew}
                />
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {budgets.map((item, index) => (
                    <BudgetRow key={item.budget.id} item={item} index={index} onPress={() => openEdit(item)} />
                  ))}
                </View>
              )}
            </View>

            {overview.uncategorised_spend > 0 ? (
              <Card subtle>
                <Text style={[typography.label, styles.label]}>UNCATEGORISED SPENDING</Text>
                <Text style={[typography.figure, { color: palette.ink, marginTop: 6 }]}>
                  {formatCurrency(overview.uncategorised_spend)}
                </Text>
                <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 4 }]}>
                  Assign categories to these entries to bring them into a budget.
                </Text>
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={{ height: insets.bottom + 92 }} />
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
        <Button label="New Budget" icon="plus" onPress={openNew} full />
      </View>

      <BudgetSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} editing={editing} month={anchor} />
    </View>
  );
}

function BudgetRow({
  item,
  index,
  onPress,
}: {
  item: BudgetProgress;
  index: number;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const over = item.remaining < 0;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 38, 220))}
    >
      <PressableScale
        onPress={onPress}
        accessibilityLabel={`${item.budget.name}, ${Math.round(item.used_pct)} percent used`}
        accessibilityHint="Opens the budget for editing"
      >
        <Card>
          <View style={styles.budgetHead}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={[typography.bodyMedium, { color: palette.ink }]} numberOfLines={1}>
                {item.budget.name}
              </Text>
              {item.budget.rollover && item.budget.rollover_amount > 0 ? (
                <Pill label={`+${formatCurrency(item.budget.rollover_amount)}`} />
              ) : null}
            </View>
            <Text
              style={[
                typography.figureSmall,
                { color: palette.ink, fontFamily: over ? fonts.semibold : fonts.medium },
              ]}
            >
              {Math.round(item.used_pct)}%
            </Text>
          </View>

          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar percent={item.used_pct} fill={stateFill(item.state)} height={4} />
          </View>

          <View style={styles.budgetMeta}>
            <Text style={[typography.caption, { color: palette.inkTertiary }]}>
              {formatCurrency(item.spent)} of {formatCurrency(item.effective_limit)}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: palette.ink, fontFamily: over ? fonts.semibold : fonts.regular },
              ]}
            >
              {over
                ? `${formatCurrency(Math.abs(item.remaining))} over`
                : `${formatCurrency(item.remaining)} left`}
            </Text>
          </View>

          {item.days_remaining > 0 && item.remaining > 0 ? (
            <View style={styles.allowanceRow}>
              <Icon name="clock" size={12} color={palette.inkQuaternary} />
              <Text style={[typography.caption, { color: palette.inkQuaternary, marginLeft: 5 }]}>
                {formatCurrency(item.daily_allowance)} a day for {item.days_remaining} more days
              </Text>
            </View>
          ) : null}
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  label: { color: palette.inkTertiary, textTransform: 'uppercase' },
  monthNav: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  headlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headlineMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  budgetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  budgetMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  allowanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
