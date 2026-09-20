/**
 * Home.
 *
 * Reads top to bottom as a briefing: who and when, the one number that
 * matters, the flow behind it, what is coming, where money went, then the
 * actions that change any of it.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { CashFlowChart } from '../../src/components/CashFlowChart';
import { Segmented } from '../../src/components/fields';
import { Icon, type IconName } from '../../src/components/Icon';
import { CategoryBreakdown } from '../../src/components/ProgressBar';
import {
  Card,
  DemoBanner,
  Divider,
  EmptyState,
  ErrorState,
  FeatureCard,
  IconButton,
  Metric,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { TransactionSheet } from '../../src/components/TransactionSheet';
import {
  dueLabel,
  formatCompact,
  formatCurrency,
  formatSignedPercent,
  greetingFor,
} from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useDashboard } from '../../src/lib/queries';
import { useAuth } from '../../src/lib/auth';
import type { UpcomingPayment } from '../../src/lib/types';
import { fonts, motion, palette, radius, spacing, typography } from '../../src/theme';

const RANGES = [
  { value: 'month', label: 'Month' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const [range, setRange] = useState<'month' | '3m' | '6m' | '12m'>('month');
  const [sheet, setSheet] = useState<'expense' | 'income' | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboard(undefined, range);
  const onRefresh = useCallback(() => refetch(), [refetch]);

  if (isLoading && !data) return <HomeSkeleton topInset={insets.top} />;

  if (isError && !data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.xxl }]}>
        <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
      </View>
    );
  }
  if (!data) return null;

  const incomeChange = formatSignedPercent(data.income_change_pct);
  const expenseChange = formatSignedPercent(data.expense_change_pct);
  const settlementNet = data.owed_to_us_total - data.we_owe_total;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={palette.inkTertiary} />
        }
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)} style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: palette.inkTertiary }]}>
              {greetingFor()}, {data.greeting_name}
            </Text>
            <Text style={[typography.title, { color: palette.ink, marginTop: 2 }]}>{data.period_label}</Text>
          </View>
          <IconButton name="settings" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        </Animated.View>

        {data.is_demo_data ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.base)}>
            <DemoBanner />
          </Animated.View>
        ) : null}

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(50)}>
          <FeatureCard>
            <Text style={styles.invLabel}>TOTAL AVAILABLE BALANCE</Text>
            <AnimatedNumber
              value={data.available_balance}
              style={[typography.display, { color: palette.inkInverse, marginTop: spacing.xs }]}
            />
            <Text style={[typography.caption, { color: palette.inkInverseTertiary, marginTop: 4 }]}>
              Cash position from your records, not a bank balance
            </Text>

            <View style={styles.featureSplit}>
              <View style={{ flex: 1 }}>
                <Text style={styles.invLabel}>INCOME</Text>
                <AnimatedNumber
                  value={data.income}
                  style={[typography.figureSmall, { color: palette.inkInverse, marginTop: 4 }]}
                />
                {incomeChange ? (
                  <Text style={[typography.caption, { color: palette.inkInverseTertiary }]}>
                    {incomeChange} vs last month
                  </Text>
                ) : null}
              </View>
              <View style={styles.featureRule} />
              <View style={{ flex: 1 }}>
                <Text style={styles.invLabel}>SPENT</Text>
                <AnimatedNumber
                  value={data.expenses}
                  style={[typography.figureSmall, { color: palette.inkInverse, marginTop: 4 }]}
                />
                {expenseChange ? (
                  <Text style={[typography.caption, { color: palette.inkInverseTertiary }]}>
                    {expenseChange} vs last month
                  </Text>
                ) : null}
              </View>
            </View>
          </FeatureCard>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(90)}>
          <Card padded={false}>
            <View style={styles.metricRow}>
              <View style={styles.metricCell}>
                <Metric
                  label="Upcoming"
                  value={
                    <AnimatedNumber
                      value={data.upcoming_commitments}
                      format="compact"
                      style={[typography.figureSmall, { color: palette.ink }]}
                    />
                  }
                  caption="next 45 days"
                />
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCell}>
                <Metric
                  label="Outstanding"
                  value={
                    <AnimatedNumber
                      value={data.total_outstanding_debt}
                      format="compact"
                      style={[typography.figureSmall, { color: palette.ink }]}
                    />
                  }
                  caption={`${formatCompact(data.monthly_emi_commitment)} a month`}
                />
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCell}>
                <Metric
                  label="Settlements"
                  value={
                    <AnimatedNumber
                      value={Math.abs(settlementNet)}
                      format="compact"
                      style={[typography.figureSmall, { color: palette.ink }]}
                    />
                  }
                  caption={settlementNet < 0 ? 'net owed out' : 'net owed to you'}
                />
              </View>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(130)}>
          <SectionHeading title="Cash flow" />
          <Card>
            <Segmented options={RANGES} value={range} onChange={(v) => setRange(v as typeof range)} />
            <View style={{ marginTop: spacing.lg }}>
              <CashFlowChart points={data.cash_flow} />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(170)}>
          <SectionHeading
            title="Upcoming payments"
            action={data.upcoming_payments.length > 0 ? 'View all' : undefined}
            onAction={() => router.push('/(tabs)/debts')}
          />
          <Card padded={false}>
            {data.upcoming_payments.length === 0 ? (
              <Text style={[typography.caption, { color: palette.inkTertiary, padding: spacing.lg }]}>
                Nothing due in the next 45 days.
              </Text>
            ) : (
              data.upcoming_payments.slice(0, 4).map((item, index, list) => (
                <UpcomingRow
                  key={`${item.source}-${item.id}`}
                  item={item}
                  last={index === list.length - 1}
                  onPress={() =>
                    router.push(
                      item.source === 'loan'
                        ? `/loan/${item.id}`
                        : item.source === 'settlement'
                          ? `/settlement/${item.id}`
                          : '/(tabs)/expenses',
                    )
                  }
                />
              ))
            )}
          </Card>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(210)}>
          <SectionHeading
            title="Spending overview"
            caption={
              data.budget_limit > 0
                ? `${formatCurrency(data.budget_spent)} of ${formatCurrency(data.budget_limit)} budgeted`
                : undefined
            }
            action="Budgets"
            onAction={() => router.push('/(tabs)/budget')}
          />
          <Card>
            <CategoryBreakdown items={data.spending_by_category} max={5} />
          </Card>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(250)}>
          <SectionHeading title="Quick actions" />
          <View style={styles.actionGrid}>
            <QuickAction label="Expense" icon="expense" onPress={() => setSheet('expense')} />
            <QuickAction label="Income" icon="income" onPress={() => setSheet('income')} />
            <QuickAction label="Payment" icon="card" onPress={() => router.push('/(tabs)/debts')} />
            <QuickAction label="Settle" icon="people" onPress={() => router.push('/settlements')} />
          </View>
        </Animated.View>

        {data.recent_transactions.length > 0 ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(290)}>
            <SectionHeading
              title="Recent activity"
              action="All entries"
              onAction={() => router.push('/(tabs)/expenses')}
            />
            <Card padded={false}>
              {data.recent_transactions.slice(0, 4).map((txn, index, list) => (
                <PressableScale
                  key={txn.id}
                  onPress={() => router.push(`/transaction/${txn.id}`)}
                  accessibilityLabel={`${txn.title}, ${formatCurrency(txn.amount)}`}
                >
                  <View style={styles.recentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, { color: palette.ink }]} numberOfLines={1}>
                        {txn.title}
                      </Text>
                      <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 2 }]}>
                        {txn.category?.name ?? 'Uncategorised'} · {txn.user.display_name}
                      </Text>
                    </View>
                    <Text style={[typography.figureSmall, { color: palette.ink }]}>
                      {txn.type === 'income' ? '+' : '−'}
                      {formatCurrency(txn.amount)}
                    </Text>
                  </View>
                  {index < list.length - 1 ? <Divider inset={spacing.md} /> : null}
                </PressableScale>
              ))}
            </Card>
          </Animated.View>
        ) : (
          <EmptyState
            title="No activity yet"
            message="Record your first expense and this screen fills in."
            action="Add expense"
            onAction={() => setSheet('expense')}
            icon="list"
          />
        )}

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>

      <TransactionSheet
        visible={sheet !== null}
        type={sheet ?? 'expense'}
        onClose={() => setSheet(null)}
        defaultUserId={user?.id}
      />
    </View>
  );
}

function UpcomingRow({ item, last, onPress }: { item: UpcomingPayment; last: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${item.title}, ${formatCurrency(item.amount)}`}>
      <View style={styles.upcomingRow}>
        <View style={styles.upcomingIcon}>
          <Icon
            name={item.source === 'loan' ? 'card' : item.source === 'settlement' ? 'people' : 'repeat'}
            size={15}
            color={palette.inkSecondary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { color: palette.ink }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text
            style={[
              typography.caption,
              {
                color: item.is_overdue ? palette.ink : palette.inkQuaternary,
                fontFamily: item.is_overdue ? fonts.medium : fonts.regular,
                marginTop: 2,
              },
            ]}
          >
            {dueLabel(item.days_until, item.is_overdue)}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </Text>
        </View>
        <Text style={[typography.figureSmall, { color: palette.ink }]}>{formatCurrency(item.amount)}</Text>
      </View>
      {!last ? <Divider inset={spacing.md + 34 + spacing.sm} /> : null}
    </PressableScale>
  );
}

function QuickAction({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.actionCell} accessibilityLabel={label}>
      <View style={styles.actionInner}>
        <Icon name={icon} size={17} color={palette.ink} />
        <Text style={[typography.caption, { color: palette.ink, marginTop: spacing.xs }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function HomeSkeleton({ topInset }: { topInset: number }) {
  return (
    <View style={[styles.root, { paddingTop: topInset + spacing.sm, paddingHorizontal: spacing.lg }]}>
      <View style={{ gap: spacing.lg }}>
        <Skeleton height={44} />
        <Skeleton height={190} />
        <Skeleton height={86} />
        <Skeleton height={220} />
        <Skeleton height={150} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  content: { paddingHorizontal: spacing.lg, gap: spacing.section },
  header: { flexDirection: 'row', alignItems: 'center' },
  invLabel: {
    ...typography.label,
    color: palette.inkInverseTertiary,
    textTransform: 'uppercase',
  },
  featureSplit: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl },
  featureRule: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: palette.borderInverse,
    marginHorizontal: spacing.md,
  },
  metricRow: { flexDirection: 'row', paddingVertical: spacing.md },
  metricCell: { flex: 1, paddingHorizontal: spacing.md },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  upcomingIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  actionGrid: { flexDirection: 'row', gap: spacing.sm },
  actionCell: { flex: 1 },
  actionInner: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
});
