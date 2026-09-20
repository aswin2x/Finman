/**
 * Debts.
 *
 * Loans, cards, BNPL and personal dues in one list, filtered by type. Each
 * card shows the recorded outstanding balance, never a figure derived from
 * EMI times tenure.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Segmented } from '../../src/components/fields';
import { Icon } from '../../src/components/Icon';
import { LoanSheet } from '../../src/components/LoanSheet';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FeatureCard,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { dueLabel, formatCurrency, titleCase } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useDebtSummary, useLoans, useSettlementSummary } from '../../src/lib/queries';
import type { Loan } from '../../src/lib/types';
import { fonts, motion, palette, spacing, typography } from '../../src/theme';

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
  const {
    data: loans = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useLoans(tab === 'all' ? {} : { debt_type: tab });

  const visible = useMemo(
    () => loans.filter((loan) => (showClosed ? true : loan.status !== 'closed')),
    [loans, showClosed],
  );
  const closedCount = loans.filter((loan) => loan.status === 'closed').length;

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
          <Text style={[typography.title, { color: palette.ink }]}>Debts</Text>
          <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
            Everything you are repaying
          </Text>
        </Animated.View>

        {summaryLoading && !summary ? (
          <Skeleton height={170} />
        ) : summary ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(50)}>
            <FeatureCard>
              <Text style={styles.invLabel}>TOTAL OUTSTANDING</Text>
              <AnimatedNumber
                value={summary.total_outstanding}
                style={[typography.display, { color: palette.inkInverse, marginTop: spacing.xs }]}
              />
              <View style={styles.featureSplit}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invLabel}>MONTHLY EMI</Text>
                  <Text style={[typography.figureSmall, { color: palette.inkInverse, marginTop: 4 }]}>
                    {formatCurrency(summary.monthly_emi_commitment)}
                  </Text>
                </View>
                <View style={styles.featureRule} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.invLabel}>ACTIVE</Text>
                  <Text style={[typography.figureSmall, { color: palette.inkInverse, marginTop: 4 }]}>
                    {summary.active_count}
                    {summary.closed_count > 0 ? (
                      <Text style={[typography.caption, { color: palette.inkInverseTertiary }]}>
                        {'   '}
                        {summary.closed_count} closed
                      </Text>
                    ) : null}
                  </Text>
                </View>
              </View>
            </FeatureCard>
          </Animated.View>
        ) : null}

        {settlements ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(80)}>
            <PressableScale onPress={() => router.push('/settlements')} accessibilityLabel="Open settlements">
              <Card>
                <View style={styles.settleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.label, styles.label]}>PERSONAL SETTLEMENTS</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
                      <View>
                        <Text style={[typography.caption, { color: palette.inkTertiary }]}>We owe</Text>
                        <Text style={[typography.figureSmall, { color: palette.ink, marginTop: 2 }]}>
                          {formatCurrency(settlements.we_owe_total)}
                        </Text>
                      </View>
                      <View>
                        <Text style={[typography.caption, { color: palette.inkTertiary }]}>Owed to us</Text>
                        <Text style={[typography.figureSmall, { color: palette.ink, marginTop: 2 }]}>
                          {formatCurrency(settlements.owed_to_us_total)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Icon name="chevron" size={18} color={palette.inkQuaternary} />
                </View>
              </Card>
            </PressableScale>
          </Animated.View>
        ) : null}

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(110)}>
          <Segmented options={TYPE_TABS} value={tab} onChange={setTab} />
        </Animated.View>

        <View>
          <SectionHeading
            title={tab === 'all' ? 'All debts' : (TYPE_TABS.find((t) => t.value === tab)?.label ?? '')}
            action={closedCount > 0 ? (showClosed ? 'Hide closed' : `Show closed (${closedCount})`) : undefined}
            onAction={() => setShowClosed((value) => !value)}
          />

          {isLoading && loans.length === 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={140} />
              <Skeleton height={140} />
            </View>
          ) : isError && loans.length === 0 ? (
            <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="card"
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

        <View style={{ height: insets.bottom + 92 }} />
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
        <Button label="Add Debt" icon="plus" onPress={() => setSheetOpen(true)} full />
      </View>

      <LoanSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

function LoanCard({ loan, index, onPress }: { loan: Loan; index: number; onPress: () => void }) {
  const reduced = useReducedMotion();
  const repaid =
    loan.principal_amount > 0
      ? Math.min(100, Math.max(0, ((loan.principal_amount - loan.outstanding_balance) / loan.principal_amount) * 100))
      : 0;
  const closed = loan.status === 'closed';
  const days = loan.next_due_date
    ? Math.round((new Date(loan.next_due_date).getTime() - Date.now()) / 86400000)
    : null;
  const overdue = days !== null && days < 0;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 38, 220))}
    >
      <PressableScale
        onPress={onPress}
        accessibilityLabel={`${loan.name}, ${formatCurrency(loan.outstanding_balance)} outstanding`}
        accessibilityHint="Opens the debt details"
      >
        <Card style={closed ? { opacity: 0.6 } : undefined}>
          <View style={styles.loanHead}>
            <View style={{ flex: 1 }}>
              <View style={styles.loanTitle}>
                <Text style={[typography.subheading, { color: palette.ink }]} numberOfLines={1}>
                  {loan.name}
                </Text>
                <Pill label={titleCase(loan.debt_type)} />
                {closed ? <Pill label="Closed" strong /> : null}
              </View>
              {loan.lender ? (
                <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 3 }]}>
                  {loan.lender}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.figure, { color: palette.ink }]}>
                {formatCurrency(loan.outstanding_balance)}
              </Text>
              <Text style={[typography.caption, { color: palette.inkQuaternary }]}>outstanding</Text>
            </View>
          </View>

          {loan.principal_amount > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar percent={repaid} fill={palette.ink} height={4} />
              <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 6 }]}>
                {Math.round(repaid)}% of {formatCurrency(loan.principal_amount)} repaid
              </Text>
            </View>
          ) : null}

          {!closed && loan.emi_amount > 0 ? (
            <View style={styles.loanFoot}>
              <Text style={[typography.caption, { color: palette.inkSecondary }]}>
                {formatCurrency(loan.emi_amount)} / month
                {loan.months_paid > 0 ? ` · ${loan.months_paid} paid` : ''}
              </Text>
              {loan.next_due_date ? (
                <Text
                  style={[
                    typography.caption,
                    {
                      color: overdue ? palette.ink : palette.inkQuaternary,
                      fontFamily: overdue ? fonts.semibold : fonts.regular,
                    },
                  ]}
                >
                  {dueLabel(days, overdue)}
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
  root: { flex: 1, backgroundColor: palette.page },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  label: { color: palette.inkTertiary, textTransform: 'uppercase' },
  invLabel: { ...typography.label, color: palette.inkInverseTertiary, textTransform: 'uppercase' },
  featureSplit: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl },
  featureRule: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: palette.borderInverse,
    marginHorizontal: spacing.md,
  },
  settleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loanHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  loanTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  loanFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
