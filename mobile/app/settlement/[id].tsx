/** Settlement detail: history, partial payments and full editing. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Gradient } from '../../src/components/Gradient';
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
import { SettlementPaymentSheet, SettlementSheet } from '../../src/components/SettlementSheet';
import { formatCurrency, formatDate } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import {
  useDeleteSettlement,
  useDeleteSettlementPayment,
  useSettlement,
  useUpdateSettlement,
} from '../../src/lib/queries';
import { useToast } from '../../src/lib/toast';
import { gradients, motion, palette, radius, spacing, typography } from '../../src/theme';

export default function SettlementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const reduced = useReducedMotion();

  const { data, isLoading, isError, error, refetch } = useSettlement(id);
  const update = useUpdateSettlement();
  const remove = useDeleteSettlement();
  const removePayment = useDeleteSettlementPayment();

  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState<string | null>(null);

  const outflow = data?.direction === 'we_owe';
  const tint = outflow ? palette.negative : palette.positive;
  const paidPct = data && data.total_amount > 0 ? (data.paid_amount / data.total_amount) * 100 : 0;

  const onVerify = async () => {
    if (!data) return;
    try {
      await update.mutateAsync({ id: data.id, is_verified: !data.is_verified });
      toast.show(data.is_verified ? 'Marked as unconfirmed' : 'Marked as confirmed');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not update', { tone: 'error' });
    }
  };

  const onDelete = async () => {
    if (!data) return;
    try {
      await remove.mutateAsync(data.id);
      setConfirmDelete(false);
      router.back();
      toast.show('Settlement removed');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not remove', { tone: 'error' });
    }
  };

  const onDeletePayment = async () => {
    if (!data || !confirmPayment) return;
    try {
      await removePayment.mutateAsync({ settlementId: data.id, paymentId: confirmPayment });
      setConfirmPayment(null);
      toast.show('Payment removed');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not remove the payment', { tone: 'error' });
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

        {isLoading && !data ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={190} />
            <Skeleton height={150} />
          </View>
        ) : isError || !data ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'This settlement could not be loaded.'}
            onRetry={refetch}
          />
        ) : (
          <>
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
              <Card raised>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <Pill label={outflow ? 'We owe' : 'Owed to us'} color={tint} />
                  <Pill
                    label={data.status === 'settled' ? 'Settled' : data.status === 'partial' ? 'Partial' : 'Pending'}
                    color={
                      data.status === 'settled'
                        ? palette.positive
                        : data.status === 'partial'
                          ? palette.warning
                          : palette.neutral
                    }
                  />
                  {!data.is_verified ? <Pill label="Unconfirmed" color={palette.neutral} /> : null}
                </View>

                <Text style={[typography.heading, { color: palette.textSecondary, marginTop: spacing.md }]}>
                  {data.person_name}
                </Text>

                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: spacing.lg }]}>
                  {data.status === 'settled' ? 'FULLY SETTLED' : 'REMAINING'}
                </Text>
                <AnimatedNumber
                  value={data.remaining_amount}
                  style={[typography.balance, { color: data.status === 'settled' ? palette.positive : tint }]}
                />

                <View style={{ marginTop: spacing.md }}>
                  <ProgressBar percent={paidPct} color={tint} height={6} />
                  <View style={styles.progressMeta}>
                    <Text style={[typography.caption, { color: palette.textTertiary }]}>
                      {formatCurrency(data.paid_amount)} paid
                    </Text>
                    <Text style={[typography.caption, { color: palette.textTertiary }]}>
                      of {formatCurrency(data.total_amount)}
                    </Text>
                  </View>
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
              <SectionHeading title="Details" />
              <Card>
                <Row label="Total agreed" value={formatCurrency(data.total_amount)} />
                <Divider style={styles.divider} />
                <Row
                  label="Expected by"
                  value={data.expected_date ? formatDate(data.expected_date) : 'No date set'}
                />
                <Divider style={styles.divider} />
                <Row label="Visibility" value={data.scope === 'shared' ? 'Shared household' : 'Personal'} />
                {data.notes ? (
                  <>
                    <Divider style={styles.divider} />
                    <View style={{ paddingVertical: spacing.sm }}>
                      <Text style={[typography.micro, { color: palette.textTertiary }]}>NOTES</Text>
                      <Text style={[typography.body, { color: palette.textPrimary, marginTop: 4 }]}>
                        {data.notes}
                      </Text>
                    </View>
                  </>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(100)}>
              <SectionHeading title="Settlement history" caption={`${data.payments.length} recorded`} />
              <Card padded={false}>
                {data.payments.length === 0 ? (
                  <View style={{ padding: spacing.lg }}>
                    <Text style={[typography.caption, { color: palette.textTertiary }]}>
                      Nothing paid yet. Partial payments are allowed.
                    </Text>
                  </View>
                ) : (
                  data.payments.map((payment, index) => (
                    <PressableScale
                      key={payment.id}
                      onLongPress={() => setConfirmPayment(payment.id)}
                      accessibilityLabel={`${formatCurrency(payment.amount)} on ${formatDate(payment.paid_on)}`}
                      accessibilityHint="Press and hold to remove this payment"
                    >
                      <View style={[styles.paymentRow, index < data.payments.length - 1 && styles.rowBorder]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { color: palette.textPrimary }]}>
                            {formatDate(payment.paid_on)}
                          </Text>
                          {payment.note ? (
                            <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 2 }]}>
                              {payment.note}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[typography.bodyStrong, { color: palette.textPrimary }]}>
                          {formatCurrency(payment.amount)}
                        </Text>
                      </View>
                    </PressableScale>
                  ))
                )}
              </Card>
              {data.payments.length > 0 ? (
                <Text style={[typography.micro, { color: palette.textTertiary, marginTop: spacing.xs }]}>
                  Press and hold a payment to remove it.
                </Text>
              ) : null}
            </Animated.View>

            <View style={{ gap: spacing.sm }}>
              {data.status !== 'settled' ? (
                <Button
                  label={outflow ? 'Record a payment' : 'Record money received'}
                  onPress={() => setPaying(true)}
                  full
                />
              ) : null}
              <Button
                label={data.is_verified ? 'Mark as unconfirmed' : 'Mark as confirmed'}
                variant="secondary"
                onPress={onVerify}
                loading={update.isPending}
                full
              />
              <Button label="Edit settlement" variant="secondary" onPress={() => setEditing(true)} full />
              <Button label="Remove settlement" variant="danger" size="sm" onPress={() => setConfirmDelete(true)} full />
            </View>
          </>
        )}
      </ScrollView>

      <SettlementSheet visible={editing} onClose={() => setEditing(false)} editing={data ?? null} />
      <SettlementPaymentSheet visible={paying} onClose={() => setPaying(false)} settlement={data ?? null} />

      <ConfirmDialog
        visible={confirmDelete}
        title="Remove this settlement?"
        message="The settlement and its payment history will be removed. Any expenses already recorded stay in your ledger."
        confirmLabel="Remove"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={remove.isPending}
      />

      <ConfirmDialog
        visible={confirmPayment !== null}
        title="Remove this payment?"
        message="The remaining amount will go back up, and the linked entry will be removed from your ledger."
        confirmLabel="Remove"
        onConfirm={onDeletePayment}
        onCancel={() => setConfirmPayment(null)}
        loading={removePayment.isPending}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[typography.body, { color: palette.textTertiary }]}>{label}</Text>
      <Text style={[typography.bodyStrong, { color: palette.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
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
