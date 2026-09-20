/**
 * Debts.
 *
 * Loans, credit cards, BNPL and personal dues in one place, filtered by type.
 * Each card shows the recorded outstanding balance and, where an interest rate
 * is known, an estimated completion date that is clearly marked as an estimate.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Segmented } from '../../src/components/fields';
import { Gradient } from '../../src/components/Gradient';
import { LoanSheet } from '../../src/components/LoanSheet';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  GradientCard,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { dueLabel, formatCurrency, titleCase } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useDebtSummary, useLoans, useSettlementSummary } from '../../src/lib/queries';
import type { Loan } from '../../src/lib/types';
import { gradients, motion, palette, spacing, typography } from '../../src/theme';

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'loan', label: 'Loans' },
  { value: 'credit_card', label: 'Cards' },
  { value: 'bnpl', label: 'BNPL' },
  { value: 'personal_due', label: 'Dues' },
];

export default function DebtsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [tab, setTab] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useDebtSummary();
  const { data: settlements } = useSettlementSummary();
  const { data: loans = [], isLoading, isError, error, refetch, isRefetching } = useLoans(
    tab === 'all' ? {} : { debt_type: tab },
  );

  const visible = useMemo(
    () => loans.filter((loan) => (showClosed ? true : loan.status !== 'closed')),
    [loans, showClosed],
  );
  const closedCount = loans.filter((loan) => loan.status === 'closed').length;

  return (
    <View style={styles.root}>
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.ember} />}
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.textPrimary }]}>Debts</Text>
          <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
            Loans, cards and everything you are repaying
          </Text>
        </Animated.View>

        {/* Summary */}
        {summaryLoading && !summary ? (
          <Skeleton height={160} />
        ) : summary ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
            <GradientCard colors={['#2A2030', '#1A1620']}>
              <Text style={[typography.micro, { color: palette.textTertiary }]}>TOTAL OUTSTANDING</Text>
              <AnimatedNumber
                value={summary.total_outstanding}
                style={[typography.balance, { color: palette.textPrimary, marginTop: spacing.xs }]}
              />
              <View style={styles.summarySplit}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.micro, { color: palette.textTertiary }]}>MONTHLY EMI</Text>
                  <Text style={[typography.subheading, { color: palette.textPrimary, marginTop: 2 }]}>
                    {formatCurrency(summary.monthly_emi_commitment)}
                  </Text>
                </View>
                <View style={styles.summaryRule} />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.micro, { color: palette.textTertiary }]}>ACTIVE</Text>
                  <Text style={[typography.subheading, { color: palette.textPrimary, marginTop: 2 }]}>
                    {summary.active_count}
                    {summary.closed_count > 0 ? (
                      <Text style={[typography.caption, { color: palette.textTertiary }]}>
                        {'  '}
                        {summary.closed_count} closed
                      </Text>
                    ) : null}
                  </Text>
                </View>
              </View>
            </GradientCard>
          </Animated.View>
        ) : null}

        {/* Settlements entry point */}
        {settlements ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(90)}>
            <PressableScale
              onPress={() => router.push('/settlements')}
              accessibilityLabel="Open personal settlements"
            >
              <Card>
                <View style={styles.settleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.micro, { color: palette.textTertiary }]}>PERSONAL SETTLEMENTS</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs }}>
                      <View>
                        <Text style={[typography.caption, { color: palette.textTertiary }]}>We owe</Text>
                        <Text style={[typography.subheading, { color: palette.negative }]}>
                          {formatCurrency(settlements.we_owe_total)}
                        </Text>
                      </View>
                      <View>
                        <Text style={[typography.caption, { color: palette.textTertiary }]}>Owed to us</Text>
                        <Text style={[typography.subheading, { color: palette.positive }]}>
                          {formatCurrency(settlements.owed_to_us_total)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[typography.heading, { color: palette.textTertiary }]}>{'›'}</Text>
                </View>
              </Card>
            </PressableScale>
          </Animated.View>
        ) : null}

        {/* Type tabs */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(120)}>
          <Segmented options={TYPE_TABS} value={tab} onChange={setTab} />
        </Animated.View>

        {/* List */}
        <View>
          <SectionHeading
            title={tab === 'all' ? 'All debts' : `${TYPE_TABS.find((t) => t.value === tab)?.label}`}
            action={closedCount > 0 ? (showClosed ? 'Hide closed' : `Show closed (${closedCount})`) : undefined}
            onAction={() => setShowClosed((value) => !value)}
          />

          {isLoading && loans.length === 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={130} />
              <Skeleton height={130} />
            </View>
          ) : isError && loans.length === 0 ? (
            <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nothing here"
              message={
                tab === 'all'
                  ? 'Add a loan, card or personal due to track what you owe.'
                  : 'No debts of this type.'
              }
              action="Add a debt"
              onAction={() => setSheetOpen(true)}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {visible.map((loan, index) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  index={index}
                  onPress={() => router.push(`/loan/${loan.id}`)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + 96 }} />
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        <Button label="+  Add Debt" onPress={() => setSheetOpen(true)} full />
      </View>

      <LoanSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

function LoanCard({ loan, index, onPress }: { loan: Loan; index: number; onPress: () => void }) {
  const reduced = useReducedMotion();
  const repaid = loan.principal_amount > 0
    ? Math.min(100, Math.max(0, ((loan.principal_amount - loan.outstanding_balance) / loan.principal_amount) * 100))
    : 0;
  const closed = loan.status === 'closed';
  const days = loan.next_due_date
    ? Math.round((new Date(loan.next_due_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 45, 250))}
    >
      <PressableScale
        onPress={onPress}
        accessibilityLabel={`${loan.name}, ${formatCurrency(loan.outstanding_balance)} outstanding`}
        accessibilityHint="Opens the debt details"
      >
        <Card style={closed ? { opacity: 0.65 } : undefined}>
          <View style={styles.loanHead}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                <Text style={[typography.subheading, { color: palette.textPrimary }]} numberOfLines={1}>
                  {loan.name}
                </Text>
                <Pill
                  label={titleCase(loan.debt_type)}
                  color={loan.debt_type === 'credit_card' ? palette.warning : palette.info}
                />
                {closed ? <Pill label="Closed" color={palette.positive} /> : null}
              </View>
              {loan.lender ? (
                <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
                  {loan.lender}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.subheading, { color: palette.textPrimary }]}>
                {formatCurrency(loan.outstanding_balance)}
              </Text>
              <Text style={[typography.micro, { color: palette.textTertiary }]}>outstanding</Text>
            </View>
          </View>

          {loan.principal_amount > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar percent={repaid} gradient={gradients.ember} height={5} />
              <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 6 }]}>
                {Math.round(repaid)}% of {formatCurrency(loan.principal_amount)} repaid
              </Text>
            </View>
          ) : null}

          {!closed && loan.emi_amount > 0 ? (
            <View style={styles.loanFoot}>
              <Text style={[typography.caption, { color: palette.textSecondary }]}>
                {formatCurrency(loan.emi_amount)} / month
                {loan.months_paid > 0 ? ` · ${loan.months_paid} paid` : ''}
              </Text>
              {loan.next_due_date ? (
                <Text
                  style={[
                    typography.caption,
                    { color: days !== null && days < 0 ? palette.negative : palette.textTertiary },
                  ]}
                >
                  {dueLabel(days, days !== null && days < 0)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  summarySplit: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  summaryRule: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: palette.hairline, marginHorizontal: spacing.md },
  settleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loanHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  loanFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
