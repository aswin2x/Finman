/**
 * Expenses.
 *
 * A searchable ledger grouped by day. Filters live in a sheet so the list
 * stays quiet, and the count sits on the filter control so a narrowed view is
 * never mistaken for the whole picture.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Segmented } from '../../src/components/fields';
import { Icon } from '../../src/components/Icon';
import { ImportExportSheet } from '../../src/components/ImportExportSheet';
import { CategoryBreakdown } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Pill,
  PressableScale,
  SectionHeading,
  Skeleton,
} from '../../src/components/primitives';
import { Sheet } from '../../src/components/Sheet';
import { TransactionSheet } from '../../src/components/TransactionSheet';
import { formatCurrency, monthKey, relativeDayLabel, titleCase } from '../../src/lib/format';
import { useReducedMotion } from '../../src/lib/motion';
import {
  useCategories,
  useHousehold,
  useMonthlySummary,
  useTransactions,
  type TransactionFilters,
} from '../../src/lib/queries';
import { useAuth } from '../../src/lib/auth';
import type { Transaction } from '../../src/lib/types';
import { motion, palette, radius, spacing, typography } from '../../src/theme';

const PAYMENT_METHODS = ['upi', 'cash', 'card', 'bank', 'wallet', 'other'];

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [portingOpen, setPortingOpen] = useState(false);
  const [entrySheet, setEntrySheet] = useState<'expense' | 'income' | null>(null);

  const month = monthKey(new Date());
  const { data: categories = [] } = useCategories(type);
  const { data: household = [] } = useHousehold();
  const { data: summary } = useMonthlySummary(month);

  const filters = useMemo<TransactionFilters>(
    () => ({
      type,
      search: search.trim() || undefined,
      category_id: categoryIds.length ? categoryIds : undefined,
      user_id: userIds.length ? userIds : undefined,
      payment_method: methods.length ? methods : undefined,
      limit: 200,
    }),
    [type, search, categoryIds, userIds, methods],
  );

  const { data, isLoading, isError, error, refetch, isRefetching } = useTransactions(filters);
  const activeFilterCount = categoryIds.length + userIds.length + methods.length;

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const map = new Map<string, Transaction[]>();
    items.forEach((txn) => {
      const list = map.get(txn.occurred_on) ?? [];
      list.push(txn);
      map.set(txn.occurred_on, list);
    });
    return Array.from(map.entries()).map(([date, rows]) => ({
      date,
      rows,
      total: rows.reduce((sum, row) => sum + row.amount, 0),
    }));
  }, [data]);

  const toggle = useCallback((list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }, []);

  const clearFilters = () => {
    setCategoryIds([]);
    setUserIds([]);
    setMethods([]);
  };

  const periodTotal = type === 'expense' ? (summary?.expenses ?? 0) : (summary?.income ?? 0);
  const listTotal = (data?.items ?? []).reduce((sum, row) => sum + row.amount, 0);
  const count = type === 'expense' ? (summary?.expense_count ?? 0) : (summary?.income_count ?? 0);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.inkTertiary} />
        }
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.ink }]}>
            {type === 'expense' ? 'Expenses' : 'Income'}
          </Text>
          <Text style={[typography.caption, { color: palette.inkTertiary, marginTop: 2 }]}>
            {summary?.month ? formatPeriod(summary.month) : 'This month'}
          </Text>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(50)}>
          <Card>
            <Text style={[typography.label, styles.label]}>
              {type === 'expense' ? 'TOTAL SPENT THIS MONTH' : 'TOTAL RECEIVED THIS MONTH'}
            </Text>
            <AnimatedNumber
              value={periodTotal}
              style={[typography.display, { color: palette.ink, marginTop: spacing.xs }]}
            />
            <View style={styles.totalMeta}>
              <Text style={[typography.caption, { color: palette.inkTertiary }]}>
                {count} {count === 1 ? 'entry' : 'entries'}
              </Text>
              {activeFilterCount > 0 ? (
                <Text style={[typography.captionMedium, { color: palette.ink }]}>
                  Filtered: {formatCurrency(listTotal)}
                </Text>
              ) : null}
            </View>
          </Card>
        </Animated.View>

        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(80)}
          style={{ gap: spacing.sm }}
        >
          <Segmented
            options={[
              { value: 'expense', label: 'Expenses' },
              { value: 'income', label: 'Income' },
            ]}
            value={type}
            onChange={(value) => {
              setType(value as 'expense' | 'income');
              setCategoryIds([]);
            }}
          />

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Icon name="search" size={16} color={palette.inkQuaternary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={`Search ${type === 'expense' ? 'expenses' : 'income'}`}
                placeholderTextColor={palette.inkQuaternary}
                style={styles.searchInput}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search"
                clearButtonMode="while-editing"
              />
            </View>
            <Chip
              label={activeFilterCount > 0 ? `${activeFilterCount}` : 'Filter'}
              icon="filter"
              active={activeFilterCount > 0}
              onPress={() => setFiltersOpen(true)}
            />
          </View>
        </Animated.View>

        {summary && summary.by_category.length > 0 && type === 'expense' ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(120)}>
            <SectionHeading title="Where it went" />
            <Card>
              <CategoryBreakdown items={summary.by_category} max={4} />
            </Card>
          </Animated.View>
        ) : null}

        <View>
          <SectionHeading title="All entries" action="Import / export" onAction={() => setPortingOpen(true)} />

          {isLoading && !data ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={70} />
              <Skeleton height={70} />
              <Skeleton height={70} />
            </View>
          ) : isError && !data ? (
            <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
          ) : grouped.length === 0 ? (
            <EmptyState
              icon="search"
              title={search || activeFilterCount ? 'Nothing matches' : 'No entries yet'}
              message={
                search || activeFilterCount
                  ? 'Try a different search, or clear the filters.'
                  : `Record your first ${type} and it appears here.`
              }
              action={search || activeFilterCount ? 'Clear filters' : `Add ${type}`}
              onAction={() => {
                if (search || activeFilterCount) {
                  setSearch('');
                  clearFilters();
                } else {
                  setEntrySheet(type);
                }
              }}
            />
          ) : (
            <View style={{ gap: spacing.lg }}>
              {grouped.map((group, groupIndex) => (
                <Animated.View
                  key={group.date}
                  entering={
                    reduced ? undefined : FadeIn.duration(motion.fast).delay(Math.min(groupIndex * 30, 180))
                  }
                >
                  <View style={styles.groupHeader}>
                    <Text style={[typography.label, styles.label]}>
                      {relativeDayLabel(group.date).toUpperCase()}
                    </Text>
                    <Text style={[typography.mono, { color: palette.inkSecondary }]}>
                      {formatCurrency(group.total)}
                    </Text>
                  </View>
                  <Card padded={false}>
                    {group.rows.map((txn, index) => (
                      <TransactionRow
                        key={txn.id}
                        txn={txn}
                        last={index === group.rows.length - 1}
                        onPress={() => router.push(`/transaction/${txn.id}`)}
                      />
                    ))}
                  </Card>
                </Animated.View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + 92 }} />
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
        <Button
          label={type === 'expense' ? 'Add Expense' : 'Add Income'}
          icon="plus"
          onPress={() => setEntrySheet(type)}
          full
        />
      </View>

      <TransactionSheet
        visible={entrySheet !== null}
        type={entrySheet ?? 'expense'}
        onClose={() => setEntrySheet(null)}
        defaultUserId={user?.id}
      />

      <ImportExportSheet visible={portingOpen} onClose={() => setPortingOpen(false)} />

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        subtitle="Narrow the list without changing your records."
        tall
        footer={
          <>
            <Button label="Show results" onPress={() => setFiltersOpen(false)} full />
            <Button label="Clear all" variant="ghost" size="sm" onPress={clearFilters} full />
          </>
        }
      >
        <FilterGroup title="Category">
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              active={categoryIds.includes(category.id)}
              onPress={() => toggle(categoryIds, category.id, setCategoryIds)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Recorded by">
          {household.map((member) => (
            <Chip
              key={member.id}
              label={member.display_name}
              active={userIds.includes(member.id)}
              onPress={() => toggle(userIds, member.id, setUserIds)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Payment method">
          {PAYMENT_METHODS.map((method) => (
            <Chip
              key={method}
              label={titleCase(method)}
              active={methods.includes(method)}
              onPress={() => toggle(methods, method, setMethods)}
            />
          ))}
        </FilterGroup>
      </Sheet>
    </View>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, styles.label]}>{title.toUpperCase()}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

export function TransactionRow({
  txn,
  last,
  onPress,
}: {
  txn: Transaction;
  last: boolean;
  onPress: () => void;
}) {
  const linked = Boolean(txn.loan_payment_id || txn.settlement_payment_id);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${txn.title}, ${formatCurrency(txn.amount)}, ${txn.category?.name ?? 'uncategorised'}`}
      accessibilityHint="Opens the entry for editing"
    >
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Icon name={txn.type === 'income' ? 'income' : 'expense'} size={14} color={palette.inkSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTitle}>
            <Text style={[typography.body, { color: palette.ink, flexShrink: 1 }]} numberOfLines={1}>
              {txn.title}
            </Text>
            {txn.scope === 'personal' ? <Pill label="Personal" /> : null}
            {linked ? <Pill label="Linked" /> : null}
          </View>
          <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 2 }]} numberOfLines={1}>
            {txn.category?.name ?? 'Uncategorised'} · {titleCase(txn.payment_method)} · {txn.user.display_name}
          </Text>
        </View>
        <Text style={[typography.figureSmall, { color: palette.ink }]}>
          {txn.type === 'income' ? '+' : '−'}
          {formatCurrency(txn.amount)}
        </Text>
      </View>
      {!last ? <Divider inset={spacing.md + 32 + spacing.sm} /> : null}
    </PressableScale>
  );
}

function formatPeriod(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.page },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  label: { color: palette.inkTertiary, textTransform: 'uppercase' },
  totalMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  searchInput: { flex: 1, marginLeft: spacing.xs, ...typography.body, color: palette.ink, padding: 0 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
