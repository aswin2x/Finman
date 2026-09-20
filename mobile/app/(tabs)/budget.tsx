/**
 * Budgets.
 *
 * Shows planned against actual for the selected month. Spending that falls
 * outside any budget is reported separately rather than quietly ignored, so
 * the headline figure is never mistaken for total spending.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { BudgetSheet } from '../../src/components/BudgetSheet';
import { Gradient } from '../../src/components/Gradient';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
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
import { gradients, motion, palette, radius, spacing, stateColor, typography } from '../../src/theme';

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
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.ember} />}
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.textPrimary }]}>Monthly budget</Text>
          <View style={styles.monthNav}>
            <PressableScale onPress={() => setAnchor(addMonths(anchor, -1))} accessibilityLabel="Previous month">
              <View style={styles.monthButton}>
                <Text style={[typography.body, { color: palette.textSecondary }]}>{'‹'}</Text>
              </View>
            </PressableScale>
            <Text style={[typography.body, { color: palette.textSecondary, flex: 1, textAlign: 'center' }]}>
              {formatMonthLong(toISODate(anchor))}
            </Text>
            <PressableScale onPress={() => setAnchor(addMonths(anchor, 1))} accessibilityLabel="Next month">
              <View style={styles.monthButton}>
                <Text style={[typography.body, { color: palette.textSecondary }]}>{'›'}</Text>
              </View>
            </PressableScale>
          </View>
        </Animated.View>

        {isLoading && !overview ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={170} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        ) : isError && !overview ? (
          <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
        ) : overview ? (
          <>
            {/* Headline */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
              <Card raised>
                <View style={styles.headlineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.micro, { color: palette.textTertiary }]}>SPENT OF BUDGET</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs }}>
                      <AnimatedNumber
                        value={overview.total_spent}
                        style={[typography.balance, { color: palette.textPrimary }]}
                      />
                    </View>
                    <Text style={[typography.body, { color: palette.textTertiary, marginTop: 2 }]}>
                      of {formatCurrency(overview.total_limit)} planned
                    </Text>
                  </View>
                  <Pill
                    label={overview.state === 'over' ? 'Over' : overview.state === 'warning' ? 'Close' : 'On track'}
                    color={stateColor(overview.state)}
                  />
                </View>

                <View style={{ marginTop: spacing.lg }}>
                  <ProgressBar
                    percent={overview.used_pct}
                    gradient={
                      overview.state === 'over'
                        ? gradients.negative
                        : overview.state === 'warning'
                          ? ['#F5B544', '#E08A1E']
                          : gradients.ember
                    }
                    height={8}
                  />
                  <View style={styles.headlineMeta}>
                    <Text style={[typography.caption, { color: palette.textTertiary }]}>
                      {Math.round(overview.used_pct)}% used
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: overview.total_remaining < 0 ? palette.negative : palette.positive },
                      ]}
                    >
                      {overview.total_remaining < 0 ? 'Over by ' : ''}
                      {formatCurrency(Math.abs(overview.total_remaining))}
                      {overview.total_remaining >= 0 ? ' left' : ''}
                    </Text>
                  </View>
                </View>
              </Card>
            </Animated.View>

            {/* Spending outside any budget */}
            {overview.unbudgeted_spend > 0 ? (
              <View style={styles.notice}>
                <Text style={[typography.caption, { color: palette.warning }]}>
                  {formatCurrency(overview.unbudgeted_spend)} was spent in categories with no budget set. It is
                  not included in the figure above.
                </Text>
              </View>
            ) : null}

            {/* Category budgets */}
            <View>
              <SectionHeading
                title="By category"
                action={budgets.length > 0 ? 'Roll forward' : undefined}
                onAction={onRollForward}
              />

              {budgets.length === 0 ? (
                <EmptyState
                  title="No budgets for this month"
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
              <Card>
                <Text style={[typography.micro, { color: palette.textTertiary }]}>UNCATEGORISED SPENDING</Text>
                <Text style={[typography.subheading, { color: palette.textPrimary, marginTop: 4 }]}>
                  {formatCurrency(overview.uncategorised_spend)}
                </Text>
                <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
                  Assign categories to these entries to bring them into a budget.
                </Text>
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={{ height: insets.bottom + 96 }} />
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        <Button label="+  New Budget" onPress={openNew} full />
      </View>

      <BudgetSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        month={anchor}
      />
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
  const tint = item.budget.category?.color ?? stateColor(item.state);

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 45, 250))}
    >
      <PressableScale
        onPress={onPress}
        accessibilityLabel={`${item.budget.name}, ${Math.round(item.used_pct)} percent used`}
        accessibilityHint="Opens the budget for editing"
      >
        <Card>
          <View style={styles.budgetHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.xs }}>
              <View style={[styles.dot, { backgroundColor: tint }]} />
              <Text style={[typography.body, { color: palette.textPrimary }]} numberOfLines={1}>
                {item.budget.name}
              </Text>
              {item.budget.rollover && item.budget.rollover_amount > 0 ? (
                <Pill label={`+${formatCurrency(item.budget.rollover_amount)}`} color={palette.info} />
              ) : null}
            </View>
            <Text style={[typography.bodyStrong, { color: stateColor(item.state) }]}>
              {Math.round(item.used_pct)}%
            </Text>
          </View>

          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar percent={item.used_pct} color={stateColor(item.state)} height={6} />
          </View>

          <View style={styles.budgetMeta}>
            <Text style={[typography.caption, { color: palette.textTertiary }]}>
              {formatCurrency(item.spent)} of {formatCurrency(item.effective_limit)}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: item.remaining < 0 ? palette.negative : palette.textSecondary },
              ]}
            >
              {item.remaining < 0
                ? `${formatCurrency(Math.abs(item.remaining))} over`
                : `${formatCurrency(item.remaining)} left`}
            </Text>
          </View>

          {item.days_remaining > 0 && item.remaining > 0 ? (
            <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 4 }]}>
              {formatCurrency(item.daily_allowance)} a day for the remaining {item.days_remaining} days
            </Text>
          ) : null}
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  monthNav: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headlineMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  budgetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  budgetMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  notice: {
    backgroundColor: palette.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,181,68,0.3)',
  },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
