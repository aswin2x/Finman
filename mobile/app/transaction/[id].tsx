/**
 * Transaction detail.
 *
 * Every field is editable here. Entries created by a loan or settlement
 * payment are flagged and cannot be deleted from this screen, because the
 * payment that produced them owns the balance.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gradient } from '../../src/components/Gradient';
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
import { TransactionSheet } from '../../src/components/TransactionSheet';
import { formatCurrency, formatDate, titleCase } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import { useDeleteTransaction, useRestoreTransaction, useTransaction } from '../../src/lib/queries';
import { useToast } from '../../src/lib/toast';
import { gradients, motion, palette, radius, spacing, typography } from '../../src/theme';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const reduced = useReducedMotion();

  const { data, isLoading, isError, error, refetch } = useTransaction(id);
  const remove = useDeleteTransaction();
  const restore = useRestoreTransaction();

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const linked = Boolean(data?.loan_payment_id || data?.settlement_payment_id);

  const onDelete = async () => {
    if (!data) return;
    try {
      await remove.mutateAsync(data.id);
      setConfirming(false);
      router.back();
      toast.show('Entry deleted', {
        actionLabel: 'Undo',
        onAction: async () => {
          await restore.mutateAsync(data.id);
          toast.show('Entry restored', { tone: 'info' });
        },
      });
    } catch (err) {
      setConfirming(false);
      toast.show(err instanceof Error ? err.message : 'Could not delete', { tone: 'error' });
    }
  };

  return (
    <View style={styles.root}>
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }]}
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
            <Skeleton height={140} />
            <Skeleton height={200} />
          </View>
        ) : isError || !data ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'This entry could not be loaded.'}
            onRetry={refetch}
          />
        ) : (
          <>
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
              <Card raised>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <Pill
                    label={data.type === 'income' ? 'Income' : 'Expense'}
                    color={data.type === 'income' ? palette.positive : palette.ember}
                  />
                  {data.scope === 'personal' ? <Pill label="Personal" color={palette.neutral} /> : null}
                  {data.is_imported ? <Pill label="Imported" color={palette.info} /> : null}
                  {linked ? <Pill label="From a payment" color={palette.warning} /> : null}
                </View>

                <Text style={[typography.display, { color: palette.textPrimary, marginTop: spacing.md }]}>
                  {formatCurrency(data.amount, { decimals: true })}
                </Text>
                <Text style={[typography.heading, { color: palette.textSecondary, marginTop: spacing.xxs }]}>
                  {data.title}
                </Text>
              </Card>
            </Animated.View>

            <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
              <SectionHeading title="Details" />
              <Card>
                <DetailRow label="Date" value={formatDate(data.occurred_on)} />
                <Divider style={styles.divider} />
                <DetailRow
                  label="Category"
                  value={data.category?.name ?? 'Uncategorised'}
                  color={data.category?.color}
                />
                <Divider style={styles.divider} />
                <DetailRow label="Payment method" value={titleCase(data.payment_method)} />
                <Divider style={styles.divider} />
                <DetailRow label="Recorded for" value={data.user.display_name} color={data.user.avatar_color} />
                <Divider style={styles.divider} />
                <DetailRow label="Visibility" value={data.scope === 'shared' ? 'Shared household' : 'Personal'} />
                {data.notes ? (
                  <>
                    <Divider style={styles.divider} />
                    <View style={{ paddingVertical: spacing.sm }}>
                      <Text style={[typography.micro, { color: palette.textTertiary }]}>NOTE</Text>
                      <Text style={[typography.body, { color: palette.textPrimary, marginTop: 4 }]}>
                        {data.notes}
                      </Text>
                    </View>
                  </>
                ) : null}
              </Card>
            </Animated.View>

            {linked ? (
              <View style={styles.notice}>
                <Text style={[typography.caption, { color: palette.warning }]}>
                  This entry was created by a recorded payment. Edit or remove that payment so the outstanding
                  balance stays correct.
                </Text>
              </View>
            ) : null}

            <Animated.View
              entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(120)}
              style={{ gap: spacing.sm }}
            >
              <Button label="Edit entry" onPress={() => setEditing(true)} full />
              <Button
                label="Delete entry"
                variant="danger"
                onPress={() => setConfirming(true)}
                disabled={linked}
                full
              />
            </Animated.View>
          </>
        )}
      </ScrollView>

      {data ? (
        <TransactionSheet
          visible={editing}
          type={data.type}
          editing={data}
          onClose={() => setEditing(false)}
        />
      ) : null}

      <ConfirmDialog
        visible={confirming}
        title="Delete this entry?"
        message="It will be removed from your totals. You can undo this straight afterwards."
        confirmLabel="Delete"
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
        loading={remove.isPending}
      />
    </View>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[typography.body, { color: palette.textTertiary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
        {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
        <Text style={[typography.bodyStrong, { color: palette.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
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
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  divider: { marginHorizontal: -spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  notice: {
    backgroundColor: palette.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,181,68,0.3)',
  },
});
