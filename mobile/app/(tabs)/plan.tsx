/**
 * Financial forecast.
 *
 * Deliberately distinct from the rest of the app: cooler surfaces, every
 * figure labelled as an estimate, and the one real number (the actual cash
 * position) kept visually separate from everything projected.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Segmented } from '../../src/components/fields';
import { ForecastAdjustmentSheet } from '../../src/components/ForecastSheet';
import { Gradient } from '../../src/components/Gradient';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Card,
  Divider,
  ErrorState,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { formatCompact, formatCurrency } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useBudgetOverview, useForecast } from '../../src/lib/queries';
import type { ForecastAdjustment, ForecastMonth } from '../../src/lib/types';
import { motion, palette, radius, spacing, typography } from '../../src/theme';

const HORIZONS = [
  { value: '1', label: '1 Month' },
  { value: '3', label: '3 Months' },
  { value: '6', label: '6 Months' },
  { value: '12', label: '12 Months' },
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

  const removeAdjustment = (index: number) => {
    setAdjustments((current) => current.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.root}>
      <Gradient colors={['#0F1218', '#0A0C10']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.info} />}
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.textPrimary }]}>Financial forecast</Text>
          <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
            Projected cash flow from your recorded history
          </Text>
        </Animated.View>

        {/* Actual vs projected, kept visually apart */}
        {isLoading && !data ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={140} />
            <Skeleton height={200} />
          </View>
        ) : isError && !data ? (
          <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
        ) : data ? (
          <>
            <Animated.View
              entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}
              style={styles.balanceRow}
            >
              <Card style={[styles.balanceCard, { borderColor: 'rgba(61,214,140,0.35)' }]}>
                <Text style={[typography.micro, { color: palette.positive }]}>ACTUAL BALANCE</Text>
                <AnimatedNumber
                  value={data.actual_balance}
                  format="compact"
                  style={[typography.heading, { color: palette.textPrimary, marginTop: spacing.xxs }]}
                />
                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                  from records today
                </Text>
              </Card>
              <Card style={[styles.balanceCard, { borderColor: 'rgba(91,143,249,0.35)' }]}>
                <Text style={[typography.micro, { color: palette.info }]}>PROJECTED</Text>
                <AnimatedNumber
                  value={data.projected_end_balance}
                  format="compact"
                  style={[typography.heading, { color: palette.textPrimary, marginTop: spacing.xxs }]}
                />
                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                  estimate in {horizonMonths} months
                </Text>
              </Card>
            </Animated.View>

            {budgets && budgets.total_limit > 0 ? (
              <Card>
                <Text style={[typography.micro, { color: palette.textTertiary }]}>BUDGETED BALANCE VIEW</Text>
                <Text style={[typography.body, { color: palette.textSecondary, marginTop: spacing.xxs }]}>
                  If you spend exactly to budget, monthly outgoings would be{' '}
                  {formatCurrency(budgets.total_limit)} rather than the{' '}
                  {formatCurrency(data.baseline_monthly_expense)} your recent months average.
                </Text>
              </Card>
            ) : null}

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(90)}>
              <Segmented
                options={HORIZONS}
                value={horizon}
                onChange={(value) => setHorizon(value as typeof horizon)}
              />
            </Animated.View>

            {/* Baseline */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(120)}>
              <SectionHeading title="Monthly baseline" caption="Averaged from your recent activity" />
              <Card>
                <BaselineRow
                  label="Projected income"
                  value={data.baseline_monthly_income}
                  color={palette.positive}
                />
                <Divider style={styles.divider} />
                <BaselineRow
                  label="Projected expenses"
                  value={data.baseline_monthly_expense}
                  color={palette.textPrimary}
                  caption="Excludes EMI, which is projected from live balances"
                />
                <Divider style={styles.divider} />
                <BaselineRow
                  label="Projected EMI"
                  value={data.baseline_monthly_emi}
                  color={palette.warning}
                />
                <Divider style={styles.divider} />
                <BaselineRow
                  label="Projected savings"
                  value={data.baseline_monthly_income - data.baseline_monthly_expense - data.baseline_monthly_emi}
                  color={
                    data.baseline_monthly_income - data.baseline_monthly_expense - data.baseline_monthly_emi >= 0
                      ? palette.positive
                      : palette.negative
                  }
                />
              </Card>
            </Animated.View>

            {/* Scenario adjustments */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(150)}>
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
                            <Text style={[typography.body, { color: palette.textPrimary }]}>
                              {adjustment.label}
                            </Text>
                            <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                              {labelForKind(adjustment.kind)}
                              {adjustment.starts_on ? ` · from ${adjustment.starts_on}` : ''}
                            </Text>
                          </View>
                          <Text
                            style={[
                              typography.bodyStrong,
                              { color: adjustment.kind === 'income_delta' ? palette.positive : palette.negative },
                            ]}
                          >
                            {adjustment.kind === 'income_delta' ? '+' : '-'}
                            {formatCurrency(Math.abs(adjustment.amount))}
                          </Text>
                        </View>
                      </Card>
                    </PressableScale>
                  ))}
                  <Text style={[typography.micro, { color: palette.textTertiary }]}>
                    Tap a change to remove it.
                  </Text>
                </View>
              ) : null}

              {delta ? (
                <Card style={{ marginTop: spacing.sm, borderColor: 'rgba(91,143,249,0.35)' }}>
                  <Text style={[typography.micro, { color: palette.info }]}>EFFECT OF THESE CHANGES</Text>
                  <Text
                    style={[
                      typography.subheading,
                      { color: delta.balance >= 0 ? palette.positive : palette.negative, marginTop: spacing.xxs },
                    ]}
                  >
                    {delta.balance >= 0 ? '+' : ''}
                    {formatCurrency(delta.balance)} by month {horizonMonths}
                  </Text>
                  <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
                    compared with no changes
                  </Text>
                </Card>
              ) : null}
            </Animated.View>

            {/* Month by month */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(180)}>
              <SectionHeading title="Month by month" caption="All figures are estimates" />
              <View style={{ gap: spacing.sm }}>
                {data.months.map((month, index) => (
                  <MonthCard key={month.month} month={month} index={index} />
                ))}
              </View>
            </Animated.View>

            {data.debt_free_month ? (
              <Card style={{ borderColor: 'rgba(61,214,140,0.35)' }}>
                <Text style={[typography.micro, { color: palette.positive }]}>MILESTONE</Text>
                <Text style={[typography.subheading, { color: palette.textPrimary, marginTop: spacing.xxs }]}>
                  Debt free from {data.debt_free_month}
                </Text>
                <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
                  Estimated from current balances and EMIs.
                </Text>
              </Card>
            ) : null}

            <View style={styles.disclaimer}>
              <Text style={[typography.caption, { color: palette.textTertiary, lineHeight: 19 }]}>
                {data.disclaimer}
              </Text>
            </View>
          </>
        ) : null}

        <View style={{ height: insets.bottom + spacing.xxl }} />
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
  color,
  caption,
}: {
  label: string;
  value: number;
  color: string;
  caption?: string;
}) {
  return (
    <View style={styles.baselineRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={[typography.body, { color: palette.textTertiary }]}>{label}</Text>
        {caption ? (
          <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>{caption}</Text>
        ) : null}
      </View>
      <Text style={[typography.bodyStrong, { color }]}>{formatCurrency(value)}</Text>
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
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 40, 240))}
    >
      <Card>
        <View style={styles.monthHead}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={[typography.subheading, { color: palette.textPrimary }]}>{month.month}</Text>
              <Pill label="Estimate" color={palette.neutral} />
            </View>
            <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 3 }]}>
              In {formatCompact(month.projected_income)} · Out {formatCompact(outgoing)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.subheading, { color: positive ? palette.positive : palette.negative }]}>
              {positive ? '+' : ''}
              {formatCompact(month.projected_savings)}
            </Text>
            <Text style={[typography.micro, { color: palette.textTertiary }]}>saved</Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.sm }}>
          <ProgressBar
            percent={ratio}
            color={ratio > 100 ? palette.negative : ratio > 85 ? palette.warning : palette.info}
            height={4}
          />
        </View>

        <View style={styles.monthFoot}>
          <Text style={[typography.micro, { color: palette.textTertiary }]}>
            EMI {formatCompact(month.projected_emi)}
          </Text>
          <Text style={[typography.micro, { color: palette.textSecondary }]}>
            Balance {formatCompact(month.projected_closing_balance)}
          </Text>
        </View>

        {month.loans_closing_this_month.length > 0 ? (
          <View style={styles.milestone}>
            <Text style={[typography.micro, { color: palette.positive }]}>
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
  root: { flex: 1, backgroundColor: '#0A0C10' },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  balanceRow: { flexDirection: 'row', gap: spacing.sm },
  balanceCard: { flex: 1, borderWidth: 1 },
  baselineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  divider: { marginHorizontal: -spacing.lg },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  monthFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  milestone: {
    marginTop: spacing.sm,
    backgroundColor: palette.positiveSoft,
    borderRadius: radius.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
  },
  disclaimer: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
});
