/**
 * Home dashboard.
 *
 * Hierarchy: who and when, then the one number that matters, then the flow
 * that produced it, then what is coming, then where money went, then the
 * actions that change any of it.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Gradient } from '../../src/components/Gradient';
import { CashFlowChart } from '../../src/components/CashFlowChart';
import { Segmented } from '../../src/components/fields';
import { CategoryBreakdown } from '../../src/components/ProgressBar';
import {
  Card,
  DemoBanner,
  EmptyState,
  ErrorState,
  GradientCard,
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
  initials,
} from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useDashboard } from '../../src/lib/queries';
import { useAuth } from '../../src/lib/auth';
import type { UpcomingPayment } from '../../src/lib/types';
import { gradients, motion, palette, radius, spacing, typography } from '../../src/theme';

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

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading && !data) return <DashboardSkeleton topInset={insets.top} />;

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

  return (
    <View style={styles.root}>
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={palette.ember} />
        }
      >
        {/* Greeting */}
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(motion.base)}
          style={styles.header}
        >
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { color: palette.textSecondary }]}>
              {greetingFor()}, {data.greeting_name}
            </Text>
            <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
              {data.period_label} · Shared household
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push('/settings')}
            accessibilityLabel="Profile and settings"
          >
            <View style={[styles.avatar, { borderColor: user?.avatar_color ?? palette.ember }]}>
              <Text style={[typography.bodyStrong, { color: palette.textPrimary }]}>
                {initials(data.greeting_name)}
              </Text>
            </View>
          </PressableScale>
        </Animated.View>

        {data.is_demo_data ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.base)}>
            <DemoBanner />
          </Animated.View>
        ) : null}

        {/* Balance */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
          <GradientCard>
            <Text style={[typography.micro, { color: 'rgba(255,255,255,0.75)' }]}>
              TOTAL AVAILABLE BALANCE
            </Text>
            <AnimatedNumber
              value={data.available_balance}
              style={[typography.balance, { color: palette.white, marginTop: spacing.xs }]}
            />
            <Text style={[typography.caption, { color: 'rgba(255,255,255,0.7)', marginTop: 2 }]}>
              Cash position from your records, not a bank balance
            </Text>

            <View style={styles.balanceSplit}>
              <View style={styles.balanceCell}>
                <Text style={[typography.micro, { color: 'rgba(255,255,255,0.7)' }]}>INCOME</Text>
                <AnimatedNumber
                  value={data.income}
                  style={[typography.subheading, { color: palette.white, marginTop: 2 }]}
                />
                {incomeChange ? (
                  <Text style={[typography.micro, { color: 'rgba(255,255,255,0.65)' }]}>
                    {incomeChange} vs last month
                  </Text>
                ) : null}
              </View>
              <View style={styles.balanceRule} />
              <View style={styles.balanceCell}>
                <Text style={[typography.micro, { color: 'rgba(255,255,255,0.7)' }]}>SPENT</Text>
                <AnimatedNumber
                  value={data.expenses}
                  style={[typography.subheading, { color: palette.white, marginTop: 2 }]}
                />
                {expenseChange ? (
                  <Text style={[typography.micro, { color: 'rgba(255,255,255,0.65)' }]}>
                    {expenseChange} vs last month
                  </Text>
                ) : null}
              </View>
            </View>
          </GradientCard>
        </Animated.View>

        {/* Supporting metrics */}
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(100)}
          style={styles.metricRow}
        >
          <MetricTile
            label="UPCOMING"
            value={data.upcoming_commitments}
            caption="next 45 days"
            tint={palette.warning}
          />
          <MetricTile
            label="OUTSTANDING"
            value={data.total_outstanding_debt}
            caption={`${formatCompact(data.monthly_emi_commitment)} a month`}
            tint={palette.negative}
          />
          <MetricTile
            label="SETTLEMENTS"
            value={data.owed_to_us_total - data.we_owe_total}
            caption={data.we_owe_total > data.owed_to_us_total ? 'net owed out' : 'net owed to you'}
            tint={palette.info}
            signed
          />
        </Animated.View>

        {/* Cash flow */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(140)}>
          <SectionHeading title="Cash flow" />
          <Card>
            <Segmented
              options={RANGES}
              value={range}
              onChange={(value) => setRange(value as typeof range)}
            />
            <View style={{ marginTop: spacing.md }}>
              <CashFlowChart points={data.cash_flow} />
            </View>
          </Card>
        </Animated.View>

        {/* Upcoming payments */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(180)}>
          <SectionHeading
            title="Upcoming payments"
            action={data.upcoming_payments.length > 0 ? 'View all' : undefined}
            onAction={() => router.push('/(tabs)/debts')}
          />
          <Card padded={false}>
            {data.upcoming_payments.length === 0 ? (
              <View style={{ padding: spacing.lg }}>
                <Text style={[typography.caption, { color: palette.textTertiary }]}>
                  Nothing due in the next 45 days.
                </Text>
              </View>
            ) : (
              data.upcoming_payments
                .slice(0, 4)
                .map((item, index) => (
                  <UpcomingRow
                    key={`${item.source}-${item.id}`}
                    item={item}
                    last={index === Math.min(3, data.upcoming_payments.length - 1)}
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

        {/* Spending overview */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(220)}>
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

        {/* Quick actions */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(260)}>
          <SectionHeading title="Quick actions" />
          <View style={styles.actionGrid}>
            <QuickAction label="Expense" tint={palette.ember} onPress={() => setSheet('expense')} />
            <QuickAction label="Income" tint={palette.positive} onPress={() => setSheet('income')} />
            <QuickAction label="Payment" tint={palette.warning} onPress={() => router.push('/(tabs)/debts')} />
            <QuickAction
              label="Settlement"
              tint={palette.info}
              onPress={() => router.push('/settlements')}
            />
          </View>
        </Animated.View>

        {/* Recent */}
        {data.recent_transactions.length > 0 ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(300)}>
            <SectionHeading
              title="Recent activity"
              action="All expenses"
              onAction={() => router.push('/(tabs)/expenses')}
            />
            <Card padded={false}>
              {data.recent_transactions.slice(0, 4).map((txn, index) => (
                <PressableScale
                  key={txn.id}
                  onPress={() => router.push(`/transaction/${txn.id}`)}
                  accessibilityLabel={`${txn.title}, ${formatCurrency(txn.amount)}`}
                >
                  <View
                    style={[
                      styles.recentRow,
                      index < Math.min(3, data.recent_transactions.length - 1) && styles.rowBorder,
                    ]}
                  >
                    <View
                      style={[
                        styles.recentDot,
                        { backgroundColor: txn.category?.color ?? palette.neutral },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, { color: palette.textPrimary }]} numberOfLines={1}>
                        {txn.title}
                      </Text>
                      <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                        {txn.category?.name ?? 'Uncategorised'} · {txn.user.display_name}
                      </Text>
                    </View>
                    <Text
                      style={[
                        typography.bodyStrong,
                        { color: txn.type === 'income' ? palette.positive : palette.textPrimary },
                      ]}
                    >
                      {txn.type === 'income' ? '+' : ''}
                      {formatCurrency(txn.amount)}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </Card>
          </Animated.View>
        ) : (
          <EmptyState
            title="No activity yet"
            message="Record your first expense and the dashboard will fill in."
            action="Add expense"
            onAction={() => setSheet('expense')}
          />
        )}

        <View style={{ height: insets.bottom + spacing.xxl }} />
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

function MetricTile({
  label,
  value,
  caption,
  tint,
  signed = false,
}: {
  label: string;
  value: number;
  caption: string;
  tint: string;
  signed?: boolean;
}) {
  return (
    <View style={styles.metricTile}>
      <View style={[styles.metricBar, { backgroundColor: tint }]} />
      <Text style={[typography.micro, { color: palette.textTertiary }]}>{label}</Text>
      <AnimatedNumber
        value={signed ? Math.abs(value) : value}
        format="compact"
        style={[typography.subheading, { color: palette.textPrimary, marginTop: 2 }]}
      />
      <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

function UpcomingRow({
  item,
  last,
  onPress,
}: {
  item: UpcomingPayment;
  last: boolean;
  onPress: () => void;
}) {
  const tint = item.is_overdue ? palette.negative : item.source === 'loan' ? palette.ember : palette.info;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${item.title}, ${formatCurrency(item.amount)}`}>
      <View style={[styles.upcomingRow, !last && styles.rowBorder]}>
        <View style={[styles.upcomingMark, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
          <View style={[styles.upcomingDot, { backgroundColor: tint }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { color: palette.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text
            style={[
              typography.micro,
              { color: item.is_overdue ? palette.negative : palette.textTertiary, marginTop: 2 },
            ]}
          >
            {dueLabel(item.days_until, item.is_overdue)}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </Text>
        </View>
        <Text style={[typography.bodyStrong, { color: palette.textPrimary }]}>
          {formatCurrency(item.amount)}
        </Text>
      </View>
    </PressableScale>
  );
}

function QuickAction({ label, tint, onPress }: { label: string; tint: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.actionCell} accessibilityLabel={`Add ${label}`}>
      <View style={[styles.actionInner, { borderColor: `${tint}44` }]}>
        <View style={[styles.actionPlus, { backgroundColor: `${tint}1F` }]}>
          <Text style={[typography.subheading, { color: tint, lineHeight: 22 }]}>+</Text>
        </View>
        <Text style={[typography.caption, { color: palette.textPrimary, marginTop: spacing.xs }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function DashboardSkeleton({ topInset }: { topInset: number }) {
  return (
    <View style={[styles.root, { paddingTop: topInset + spacing.md, paddingHorizontal: spacing.lg }]}>
      <View style={{ gap: spacing.lg }}>
        <Skeleton height={44} />
        <Skeleton height={180} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Skeleton height={84} width="32%" />
          <Skeleton height={84} width="32%" />
          <Skeleton height={84} width="32%" />
        </View>
        <Skeleton height={220} />
        <Skeleton height={160} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceSplit: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  balanceCell: { flex: 1 },
  balanceRule: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: 'rgba(255,255,255,0.28)', marginHorizontal: spacing.md },
  metricRow: { flexDirection: 'row', gap: spacing.sm },
  metricTile: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    paddingTop: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  metricBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.85 },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  upcomingMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingDot: { width: 7, height: 7, borderRadius: 4 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
  recentRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  recentDot: { width: 8, height: 8, borderRadius: 4 },
  actionGrid: { flexDirection: 'row', gap: spacing.sm },
  actionCell: { flex: 1 },
  actionInner: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionPlus: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
