/**
 * Loan detail.
 *
 * Shows the recorded outstanding balance as the source of truth, with the
 * completion date presented as an estimate derived from the balance, EMI and
 * rate. Where an EMI cannot clear the balance, no date is invented.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Gradient } from '../../src/components/Gradient';
import { LoanPaymentSheet, LoanSheet } from '../../src/components/LoanSheet';
import { ProgressBar } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  Divider,
  ErrorState,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { ConfirmDialog } from '../../src/components/Sheet';
import { dueLabel, formatCurrency, formatDate, titleCase } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useDeleteLoan, useDeleteLoanPayment, useLoan } from '../../src/lib/queries';
import { useToast } from '../../src/lib/toast';
import { gradients, motion, palette, radius, spacing, typography } from '../../src/theme';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const reduced = useReducedMotion();

  const { data: loan, isLoading, isError, error, refetch } = useLoan(id);
  const removeLoan = useDeleteLoan();
  const removePayment = useDeleteLoanPayment();

  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState<string | null>(null);

  const onDeleteLoan = async () => {
    if (!loan) return;
    try {
      await removeLoan.mutateAsync(loan.id);
      setConfirmDelete(false);
      router.back();
      toast.show('Debt removed');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not remove', { tone: 'error' });
    }
  };

  const onDeletePayment = async () => {
    if (!loan || !confirmPayment) return;
    try {
      await removePayment.mutateAsync({ loanId: loan.id, paymentId: confirmPayment });
      setConfirmPayment(null);
      toast.show('Payment removed and balance restored');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not remove the payment', { tone: 'error' });
    }
  };

  const days = loan?.next_due_date
    ? Math.round((new Date(loan.next_due_date).getTime() - Date.now()) / 86400000)
    : null;

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

        {isLoading && !loan ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={200} />
            <Skeleton height={150} />
          </View>
        ) : isError || !loan ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'This debt could not be loaded.'}
            onRetry={refetch}
          />
        ) : (
          <>
            {/* Headline */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
              <Card raised>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <Pill label={titleCase(loan.debt_type)} color={palette.info} />
                  <Pill
                    label={titleCase(loan.status)}
                    color={loan.status === 'closed' ? palette.positive : loan.status === 'paused' ? palette.warning : palette.ember}
                  />
                  {loan.scope === 'personal' ? <Pill label="Personal" color={palette.neutral} /> : null}
                </View>

                <Text style={[typography.heading, { color: palette.textSecondary, marginTop: spacing.md }]}>
                  {loan.name}
                </Text>
                {loan.lender ? (
                  <Text style={[typography.caption, { color: palette.textTertiary }]}>{loan.lender}</Text>
                ) : null}

                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: spacing.lg }]}>
                  OUTSTANDING BALANCE
                </Text>
                <AnimatedNumber
                  value={loan.outstanding_balance}
                  style={[typography.balance, { color: palette.textPrimary }]}
                />

                {loan.principal_amount > 0 ? (
                  <View style={{ marginTop: spacing.md }}>
                    <ProgressBar percent={loan.progress_pct} gradient={gradients.ember} height={7} />
                    <View style={styles.progressMeta}>
                      <Text style={[typography.caption, { color: palette.textTertiary }]}>
                        {Math.round(loan.progress_pct)}% repaid
                      </Text>
                      <Text style={[typography.caption, { color: palette.textTertiary }]}>
                        of {formatCurrency(loan.principal_amount)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </Card>
            </Animated.View>

            {/* Terms */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
              <SectionHeading title="Terms" />
              <Card>
                <Row label="Monthly EMI" value={formatCurrency(loan.emi_amount)} />
                <Divider style={styles.divider} />
                <Row
                  label="Interest rate"
                  value={loan.interest_rate_annual ? `${loan.interest_rate_annual}% a year` : 'Not recorded'}
                />
                <Divider style={styles.divider} />
                <Row
                  label="Tenure"
                  value={loan.tenure_months ? `${loan.tenure_months} months` : 'Revolving'}
                />
                <Divider style={styles.divider} />
                <Row label="Payments recorded" value={`${loan.months_paid}`} />
                <Divider style={styles.divider} />
                <Row label="Total paid here" value={formatCurrency(loan.total_paid)} />
                <Divider style={styles.divider} />
                <Row
                  label="Next payment"
                  value={loan.next_due_date ? `${formatDate(loan.next_due_date)}` : 'Not scheduled'}
                  caption={loan.next_due_date ? dueLabel(days, days !== null && days < 0) : undefined}
                />
              </Card>
            </Animated.View>

            {/* Projection */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(100)}>
              <SectionHeading title="Projection" caption="Estimated from the current balance, EMI and rate" />
              <Card>
                {loan.remaining_months_estimate === null ? (
                  <Text style={[typography.body, { color: palette.warning }]}>
                    At this EMI the balance will not reduce. Increase the EMI or record extra payments to clear it.
                  </Text>
                ) : loan.remaining_months_estimate === 0 ? (
                  <Text style={[typography.body, { color: palette.positive }]}>
                    This debt is fully repaid.
                  </Text>
                ) : (
                  <>
                    <Row
                      label="Payments remaining"
                      value={`about ${loan.remaining_months_estimate} months`}
                    />
                    {loan.expected_completion ? (
                      <>
                        <Divider style={styles.divider} />
                        <Row
                          label="Expected completion"
                          value={formatDate(loan.expected_completion)}
                          caption="Estimate, not a commitment from the lender"
                        />
                      </>
                    ) : null}
                  </>
                )}
              </Card>
            </Animated.View>

            {/* History */}
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(140)}>
              <SectionHeading title="Payment history" caption={`${loan.payments.length} recorded`} />
              <Card padded={false}>
                {loan.payments.length === 0 ? (
                  <View style={{ padding: spacing.lg }}>
                    <Text style={[typography.caption, { color: palette.textTertiary }]}>
                      No payments recorded yet. Recording one reduces the outstanding balance.
                    </Text>
                  </View>
                ) : (
                  loan.payments.map((payment, index) => (
                    <PressableScale
                      key={payment.id}
                      onLongPress={() => setConfirmPayment(payment.id)}
                      accessibilityLabel={`${formatCurrency(payment.amount)} on ${formatDate(payment.paid_on)}`}
                      accessibilityHint="Press and hold to remove this payment"
                    >
                      <View
                        style={[styles.paymentRow, index < loan.payments.length - 1 && styles.rowBorder]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { color: palette.textPrimary }]}>
                            {formatDate(payment.paid_on)}
                          </Text>
                          <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                            {titleCase(payment.payment_type)}
                            {payment.note ? ` · ${payment.note}` : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            typography.bodyStrong,
                            { color: payment.payment_type === 'charge' ? palette.negative : palette.textPrimary },
                          ]}
                        >
                          {payment.payment_type === 'charge' ? '+' : '-'}
                          {formatCurrency(payment.amount)}
                        </Text>
                      </View>
                    </PressableScale>
                  ))
                )}
              </Card>
              {loan.payments.length > 0 ? (
                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: spacing.xs }]}>
                  Press and hold a payment to remove it and restore the balance.
                </Text>
              ) : null}
            </Animated.View>

            {loan.notes ? (
              <Card>
                <Text style={[typography.micro, { color: palette.textTertiary }]}>NOTES</Text>
                <Text style={[typography.body, { color: palette.textPrimary, marginTop: 4 }]}>{loan.notes}</Text>
              </Card>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <Button label="Record a payment" onPress={() => setPaying(true)} full />
              <Button label="Edit details" variant="secondary" onPress={() => setEditing(true)} full />
              <Button label="Remove this debt" variant="danger" size="sm" onPress={() => setConfirmDelete(true)} full />
            </View>
          </>
        )}
      </ScrollView>

      <LoanSheet visible={editing} onClose={() => setEditing(false)} editing={loan ?? null} />
      <LoanPaymentSheet visible={paying} onClose={() => setPaying(false)} loan={loan ?? null} />

      <ConfirmDialog
        visible={confirmDelete}
        title="Remove this debt?"
        message="The debt and its payment history will be removed. Expenses already recorded stay in your ledger."
        confirmLabel="Remove"
        onConfirm={onDeleteLoan}
        onCancel={() => setConfirmDelete(false)}
        loading={removeLoan.isPending}
      />

      <ConfirmDialog
        visible={confirmPayment !== null}
        title="Remove this payment?"
        message="The outstanding balance will go back up by this amount, and the linked expense will be removed."
        confirmLabel="Remove"
        onConfirm={onDeletePayment}
        onCancel={() => setConfirmPayment(null)}
        loading={removePayment.isPending}
      />
    </View>
  );
}

function Row({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[typography.body, { color: palette.textTertiary }]}>{label}</Text>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
        <Text style={[typography.bodyStrong, { color: palette.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
        {caption ? (
          <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>{caption}</Text>
        ) : null}
      </View>
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
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  divider: { marginHorizontal: -spacing.lg },
  paymentRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
});
