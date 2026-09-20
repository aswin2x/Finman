/**
 * Forecast.
 *
 * The planning screen. The one real figure, today's cash position, is kept
 * visually apart from everything projected, and every estimate says so.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Segmented } from '../../src/components/fields';
import { ForecastAdjustmentSheet } from '../../src/components/ForecastSheet';
import { Icon } from '../../src/components/Icon';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Card,
  Divider,
  ErrorState,
  Notice,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { formatCompact, formatCurrency } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useBudgetOverview, useForecast } from '../../src/lib/queries';
import type { ForecastAdjustment, ForecastMonth } from '../../src/lib/types';
import { fonts, motion, palette, spacing, typography } from '../../src/theme';

const HORIZONS = [
  { value: '1', label: '1M' },
  { value: '3', label: '3M' },
  { value: '6', label: '6M' },
  { value: '12', label: '12M' },
];

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const [horizon, setHorizon] = useState<'1' | '3' | '6' | '12'>('6');
  const [adjustments, setAdjustments] = useState<ForecastAdjustment[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const horizonMonths = Number(horizon) as 1 | 3 | 6 | 12;
  const { data, isLoading, isError, error, refetch, isRefetching } = useForecast(horizonMonths, adjustments);
  const { data: base } = useForecast(horizonMonths, []);
  const { data: budgets } = useBudgetOverview();

  const delta = useMemo(() => {
    if (!data || !base || adjustments.length === 0) return null;
    return {
      balance: data.projected_end_balance - base.projected_end_balance,
      savings: data.total_projected_savings - base.total_projected_savings,
    };
  }, [data, base, adjustments]);

  const removeAdjustment = (index: number) =>
    setAdjustments((current) => current.filter((_, i) => i !== index));

  const monthlySavings = data
    ? data.baseline_monthly_income - data.baseline_monthly_expense - data.baseline_monthly_emi
    : 0;

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
          <Text style={[typography.title, { color: palette.ink }]}>Plan</Text>
          <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
            Projected from your recorded history
          </Text>
        </Animated.View>

        {isLoading && !data ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={120} />
            <Skeleton height={200} />
          </View>
        ) : isError && !data ? (
          <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
        ) : data ? (
          <>
            {/* The real figure and the estimate, deliberately separated. */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(50)}>
              <Card padded={false}>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceCell}>
                    <Text style={[typography.label, styles.label]}>ACTUAL TODAY</Text>
                    <AnimatedNumber
                      value={data.actual_balance}
                      format="compact"
                      style={[typography.figure, { color: palette.ink, marginTop: 6 }]}
                    />
                    <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 2 }]}>
                      from your records
                    </Text>
                  </View>
                  <View style={styles.balanceDivider} />
                  <View style={styles.balanceCell}>
                    <View style={styles.projectedLabel}>
                      <Text style={[typography.label, styles.label]}>PROJECTED</Text>
                      <Pill label="Est" />
                    </View>
                    <AnimatedNumber
                      value={data.projected_end_balance}
                      format="compact"
                      style={[typography.figure, { color: palette.inkSecondary, marginTop: 6 }]}
                    />
                    <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 2 }]}>
                      in {horizonMonths} months
                    </Text>
                  </View>
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(80)}>
              <Segmented options={HORIZONS} value={horizon} onChange={(v) => setHorizon(v as typeof horizon)} />
            </Animated.View>

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(110)}>
              <SectionHeading title="Monthly baseline" caption="Averaged from your recent activity" />
              <Card>
                <BaselineRow label="Projected income" value={data.baseline_monthly_income} />
                <Divider style={styles.rowDivider} />
                <BaselineRow
                  label="Projected expenses"
                  value={data.baseline_monthly_expense}
                  caption="Excludes EMI, projected separately below"
                />
                <Divider style={styles.rowDivider} />
                <BaselineRow label="Projected EMI" value={data.baseline_monthly_emi} />
                <Divider style={styles.rowDivider} />
                <BaselineRow label="Projected savings" value={monthlySavings} strong signed />
              </Card>
            </Animated.View>

            {budgets && budgets.total_limit > 0 ? (
              <Notice>
                Spending exactly to budget would put monthly outgoings at{' '}
                {formatCurrency(budgets.total_limit)}, against the {formatCurrency(data.baseline_monthly_expense)}{' '}
                your recent months average.
              </Notice>
            ) : null}

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(140)}>
              <SectionHeading
                title="What if"
                action="Add change"
                onAction={() => setSheetOpen(true)}
                caption={adjustments.length === 0 ? 'Try a raise, a new cost or a one-off expense' : undefined}
              />

              {adjustments.length > 0 ? (
                <View style={{ gap: spacing.xs }}>
                  {adjustments.map((adjustment, index) => (
                    <PressableScale
                      key={`${adjustment.label}-${index}`}
                      onPress={() => removeAdjustment(index)}
                      accessibilityLabel={`Remove ${adjustment.label}`}
                      accessibilityHint="Removes this what-if change"
                    >
                      <Card>
                        <View style={styles.adjustRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[typography.body, { color: palette.ink }]}>{adjustment.label}</Text>
                            <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 2 }]}>
                              {labelForKind(adjustment.kind)}
                            </Text>
                          </View>
                          <Text style={[typography.figureSmall, { color: palette.ink }]}>
                            {adjustment.kind === 'income_delta' ? '+' : '−'}
                            {formatCurrency(Math.abs(adjustment.amount))}
                          </Text>
                          <Icon name="close" size={15} color={palette.inkQuaternary} style={{ marginLeft: spacing.sm }} />
                        </View>
                      </Card>
                    </PressableScale>
                  ))}
                </View>
              ) : null}

              {delta ? (
                <Card subtle style={{ marginTop: spacing.sm }}>
                  <Text style={[typography.label, styles.label]}>EFFECT OF THESE CHANGES</Text>
                  <Text
                    style={[typography.figure, { color: palette.ink, marginTop: 6, fontFamily: fonts.semibold }]}
                  >
                    {delta.balance >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(delta.balance))}
                  </Text>
                  <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
                    by month {horizonMonths}, compared with no changes
                  </Text>
                </Card>
              ) : null}
            </Animated.View>

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(170)}>
              <SectionHeading title="Month by month" caption="Every figure is an estimate" />
              <View style={{ gap: spacing.sm }}>
                {data.months.map((month, index) => (
                  <MonthCard key={month.month} month={month} index={index} />
                ))}
              </View>
            </Animated.View>

            {data.debt_free_month ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="check" size={16} color={palette.ink} />
                  <Text style={[typography.label, styles.label, { marginLeft: 6 }]}>MILESTONE</Text>
                </View>
                <Text style={[typography.subheading, { color: palette.ink, marginTop: 6 }]}>
                  Debt free from {data.debt_free_month}
                </Text>
                <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
                  Estimated from current balances and EMIs.
                </Text>
              </Card>
            ) : null}

            <Notice icon="info">{data.disclaimer}</Notice>
          </>
        ) : null}

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>

      <ForecastAdjustmentSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={(adjustment) => setAdjustments((current) => [...current, adjustment])}
      />
    </View>
  );
}

function BaselineRow({
  label,
  value,
  caption,
  strong = false,
  signed = false,
}: {
  label: string;
  value: number;
  caption?: string;
  strong?: boolean;
  signed?: boolean;
}) {
  return (
    <View style={styles.baselineRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={[typography.body, { color: palette.inkSecondary }]}>{label}</Text>
        {caption ? (
          <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 2 }]}>{caption}</Text>
        ) : null}
      </View>
      <Text
        style={[
          typography.figureSmall,
          { color: palette.ink, fontFamily: strong ? fonts.semibold : fonts.medium },
        ]}
      >
        {signed ? (value >= 0 ? '+' : '−') : ''}
        {formatCurrency(Math.abs(value))}
      </Text>
    </View>
  );
}

function MonthCard({ month, index }: { month: ForecastMonth; index: number }) {
  const reduced = useReducedMotion();
  const positive = month.projected_savings >= 0;
  const outgoing = month.projected_expenses + month.projected_emi;
  const ratio = month.projected_income > 0 ? (outgoing / month.projected_income) * 100 : 100;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 32, 200))}
    >
      <Card>
        <View style={styles.monthHead}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyMedium, { color: palette.ink }]}>{month.month}</Text>
            <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 3 }]}>
              In {formatCompact(month.projected_income)} · Out {formatCompact(outgoing)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.figureSmall, { color: palette.ink }]}>
              {positive ? '+' : '−'}
              {formatCompact(Math.abs(month.projected_savings))}
            </Text>
            <Text style={[typography.caption, { color: palette.inkQuaternary }]}>saved</Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.sm }}>
          <ProgressBar percent={ratio} fill={ratio > 100 ? palette.ink : palette.inkTertiary} height={3} />
        </View>

        <View style={styles.monthFoot}>
          <Text style={[typography.caption, { color: palette.inkQuaternary }]}>
            EMI {formatCompact(month.projected_emi)}
          </Text>
          <Text style={[typography.caption, { color: palette.inkSecondary }]}>
            Balance {formatCompact(month.projected_closing_balance)}
          </Text>
        </View>

        {month.loans_closing_this_month.length > 0 ? (
          <View style={styles.milestone}>
            <Icon name="check" size={12} color={palette.inkSecondary} />
            <Text style={[typography.caption, { color: palette.inkSecondary, marginLeft: 6 }]}>
              {month.loans_closing_this_month.join(', ')} finishes this month
            </Text>
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function labelForKind(kind: ForecastAdjustment['kind']): string {
  switch (kind) {
    case 'income_delta':
      return 'Income change, every month';
    case 'expense_delta':
      return 'Expense change, every month';
    case 'new_recurring':
      return 'New recurring cost';
    default:
      return 'One-off cost';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  label: { color: palette.inkTertiary, textTransform: 'uppercase' },
  balanceRow: { flexDirection: 'row', paddingVertical: spacing.lg },
  balanceCell: { flex: 1, paddingHorizontal: spacing.lg },
  balanceDivider: { width: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  projectedLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  baselineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowDivider: { marginHorizontal: -spacing.lg },
  adjustRow: { flexDirection: 'row', alignItems: 'center' },
  monthHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  monthFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
});
