/**
 * Personal settlements.
 *
 * Splits what the household owes from what is owed to it, and tracks partial
 * payments. Amounts that have not been confirmed with the other person are
 * flagged so they can be checked rather than trusted blindly.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../src/components/AnimatedNumber';
import { Segmented } from '../src/components/fields';
import { ProgressBar } from '../src/components/ProgressBar';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../src/components/primitives';
import { SettlementSheet } from '../src/components/SettlementSheet';
import { formatCurrency, formatDate } from '../src/lib/format';
import { useReducedMotion } from '../src/lib/motion';
import { useSettlementSummary, useSettlements } from '../src/lib/queries';
import type { Settlement } from '../src/lib/types';
import { motion, palette, radius, spacing, typography } from '../src/theme';

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'we_owe', label: 'We owe' },
  { value: 'owed_to_us', label: 'Owed to us' },
  { value: 'settled', label: 'Settled' },
];

export default function SettlementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [tab, setTab] = useState('pending');
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: summary } = useSettlementSummary();
  const { data: rows = [], isLoading, isError, error, refetch, isRefetching } = useSettlements(
    tab === 'we_owe' || tab === 'owed_to_us' ? { direction: tab } : tab === 'settled' ? { status: 'settled' } : {},
  );

  const visible = useMemo(
    () => (tab === 'pending' ? rows.filter((row) => row.status !== 'settled') : rows),
    [rows, tab],
  );

  const weOwe = visible.filter((row) => row.direction === 'we_owe');
  const owedToUs = visible.filter((row) => row.direction === 'owed_to_us');

  return (
    <View style={styles.root}>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.ink} />}
      >
        <View style={styles.navBar}>
          <IconButton name="back" accessibilityLabel="Go back" onPress={() => router.back()} />
        </View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.ink }]}>Settlements</Text>
          <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
            Money between you and people outside the household
          </Text>
        </Animated.View>

        {/* Summary */}
        {summary ? (
          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}
            style={styles.summaryRow}
          >
            <Card style={{ flex: 1 }}>
              <Text style={[typography.label, { color: palette.inkTertiary }]}>WE OWE</Text>
              <AnimatedNumber
                value={summary.we_owe_total}
                style={[typography.heading, { color: palette.ink, marginTop: spacing.xxs }]}
              />
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={[typography.label, { color: palette.inkTertiary }]}>OWED TO US</Text>
              <AnimatedNumber
                value={summary.owed_to_us_total}
                style={[typography.heading, { color: palette.ink, marginTop: spacing.xxs }]}
              />
            </Card>
          </Animated.View>
        ) : null}

        {summary && summary.net_position !== 0 ? (
          <View style={styles.netBox}>
            <Text style={[typography.caption, { color: palette.inkSecondary }]}>
              Net position: {summary.net_position >= 0 ? 'you are owed ' : 'you owe '}
              <Text style={{ color: summary.net_position >= 0 ? palette.ink : palette.ink }}>
                {formatCurrency(Math.abs(summary.net_position))}
              </Text>
            </Text>
          </View>
        ) : null}

        {summary && summary.unverified_count > 0 ? (
          <View style={styles.notice}>
            <Text style={[typography.caption, { color: palette.inkSecondary }]}>
              {summary.unverified_count}{' '}
              {summary.unverified_count === 1 ? 'amount has' : 'amounts have'} not been confirmed with the other
              person yet. Open one to mark it as confirmed.
            </Text>
          </View>
        ) : null}

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(90)}>
          <Segmented options={TABS} value={tab} onChange={setTab} />
        </Animated.View>

        {isLoading && rows.length === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={100} />
            <Skeleton height={100} />
          </View>
        ) : isError && rows.length === 0 ? (
          <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nothing to settle"
            message="Add what you owe someone, or what they owe you, and track it to zero."
            action="Add a settlement"
            onAction={() => setSheetOpen(true)}
          />
        ) : (
          <>
            {weOwe.length > 0 ? (
              <View>
                <SectionHeading title="We owe" />
                <View style={{ gap: spacing.sm }}>
                  {weOwe.map((row, index) => (
                    <SettlementCard
                      key={row.id}
                      row={row}
                      index={index}
                      onPress={() => router.push(`/settlement/${row.id}`)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {owedToUs.length > 0 ? (
              <View>
                <SectionHeading title="Owed to us" />
                <View style={{ gap: spacing.sm }}>
                  {owedToUs.map((row, index) => (
                    <SettlementCard
                      key={row.id}
                      row={row}
                      index={index}
                      onPress={() => router.push(`/settlement/${row.id}`)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}

        <View style={{ height: insets.bottom + 96 }} />
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        <Button label="Add Settlement" icon="plus" onPress={() => setSheetOpen(true)} full />
      </View>

      <SettlementSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

function SettlementCard({
  row,
  index,
  onPress,
}: {
  row: Settlement;
  index: number;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const outflow = row.direction === 'we_owe';
  const tint = outflow ? palette.ink : palette.ink;
  const paidPct = row.total_amount > 0 ? (row.paid_amount / row.total_amount) * 100 : 0;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(Math.min(index * 45, 250))}
    >
      <PressableScale
        onPress={onPress}
        accessibilityLabel={`${row.person_name}, ${outflow ? 'you owe' : 'owes you'} ${formatCurrency(row.remaining_amount)}`}
      >
        <Card>
          <View style={styles.cardHead}>
            <View style={[styles.avatar, { backgroundColor: `${tint}1F`, borderColor: `${tint}44` }]}>
              <Text style={[typography.bodyMedium, { color: tint }]}>
                {row.person_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                <Text style={[typography.subheading, { color: palette.ink }]} numberOfLines={1}>
                  {row.person_name}
                </Text>
                {row.status === 'settled' ? <Pill label="Settled" /> : null}
                {row.status === 'partial' ? <Pill label="Partial" /> : null}
                {!row.is_verified && row.status !== 'settled' ? (
                  <Pill label="Unconfirmed" />
                ) : null}
              </View>
              <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
                {outflow ? 'You owe' : 'Owes you'}
                {row.expected_date ? ` · by ${formatDate(row.expected_date)}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.subheading, { color: tint }]}>
                {formatCurrency(row.remaining_amount)}
              </Text>
              {row.paid_amount > 0 ? (
                <Text style={[typography.label, { color: palette.inkTertiary }]}>
                  of {formatCurrency(row.total_amount)}
                </Text>
              ) : null}
            </View>
          </View>

          {row.paid_amount > 0 && row.status !== 'settled' ? (
            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar percent={paidPct} fill={tint} height={4} />
              <Text style={[typography.label, { color: palette.inkTertiary, marginTop: 5 }]}>
                {formatCurrency(row.paid_amount)} paid so far
              </Text>
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
  navBar: { flexDirection: 'row' },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  netBox: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  notice: {
    backgroundColor: palette.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
