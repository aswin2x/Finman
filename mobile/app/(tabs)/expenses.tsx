/**
 * Expenses.
 *
 * A searchable, filterable ledger grouped by day. Filters live in a sheet so
 * the list itself stays uncluttered, and the active count is shown on the
 * button so a filtered view is never mistaken for the full picture.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { Gradient } from '../../src/components/Gradient';
import { Segmented } from '../../src/components/fields';
import { ImportExportSheet } from '../../src/components/ImportExportSheet';
import { CategoryBreakdown } from '../../src/components/ProgressBar';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PressableScale,
  Pill,
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
import { gradients, motion, palette, radius, spacing, typography } from '../../src/theme';

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

  return (
    <View style={styles.root}>
      <Gradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.ember} />}
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base)}>
          <Text style={[typography.title, { color: palette.textPrimary }]}>
            {type === 'expense' ? 'Expenses' : 'Income'}
          </Text>
          <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>
            {summary?.month ? formatPeriod(summary.month) : 'This month'}
          </Text>
        </Animated.View>

        {/* Total for the month */}
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(60)}>
          <Card raised>
            <Text style={[typography.micro, { color: palette.textTertiary }]}>
              {type === 'expense' ? 'TOTAL SPENT THIS MONTH' : 'TOTAL RECEIVED THIS MONTH'}
            </Text>
            <AnimatedNumber
              value={periodTotal}
              style={[typography.balance, { color: palette.textPrimary, marginTop: spacing.xs }]}
            />
            <View style={styles.totalMeta}>
              <Text style={[typography.caption, { color: palette.textTertiary }]}>
                {type === 'expense' ? summary?.expense_count ?? 0 : summary?.income_count ?? 0} entries
              </Text>
              {activeFilterCount > 0 ? (
                <Text style={[typography.caption, { color: palette.ember }]}>
                  Filtered view: {formatCurrency(listTotal)}
                </Text>
              ) : null}
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(90)}>
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
        </Animated.View>

        {/* Search and filters */}
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(120)}
          style={styles.searchRow}
        >
          <View style={styles.searchBox}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${type === 'expense' ? 'expenses' : 'income'}`}
              placeholderTextColor={palette.textTertiary}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search"
              clearButtonMode="while-editing"
            />
          </View>
          <Chip
            label={activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
            active={activeFilterCount > 0}
            onPress={() => setFiltersOpen(true)}
          />
        </Animated.View>

        {/* Category breakdown */}
        {summary && summary.by_category.length > 0 && type === 'expense' ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(motion.base).delay(150)}>
            <SectionHeading title="Where it went" />
            <Card>
              <CategoryBreakdown items={summary.by_category} max={4} />
            </Card>
          </Animated.View>
        ) : null}

        {/* Ledger */}
        <View>
          <SectionHeading
            title="All entries"
            action="Import / export"
            onAction={() => setPortingOpen(true)}
          />

          {isLoading && !data ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={64} />
              <Skeleton height={64} />
              <Skeleton height={64} />
            </View>
          ) : isError && !data ? (
            <ErrorState message={error instanceof Error ? error.message : 'Unknown error'} onRetry={refetch} />
          ) : grouped.length === 0 ? (
            <EmptyState
              title={search || activeFilterCount ? 'Nothing matches' : 'No entries yet'}
              message={
                search || activeFilterCount
                  ? 'Try a different search or clear the filters.'
                  : `Record your first ${type} and it will appear here.`
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
                  entering={reduced ? undefined : FadeIn.duration(motion.fast).delay(Math.min(groupIndex * 40, 200))}
                >
                  <View style={styles.groupHeader}>
                    <Text style={[typography.micro, { color: palette.textTertiary }]}>
                      {relativeDayLabel(group.date).toUpperCase()}
                    </Text>
                    <Text style={[typography.micro, { color: palette.textSecondary }]}>
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

        <View style={{ height: insets.bottom + 96 }} />
      </ScrollView>

      {/* Add button */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        <Button
          label={type === 'expense' ? '+  Add Expense' : '+  Add Income'}
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

      {/* Filters */}
      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        subtitle="Narrow the list without changing your records."
        tall
        footer={
          <>
            <Button label="Show results" onPress={() => setFiltersOpen(false)} full />
            <Button
              label="Clear all"
              variant="ghost"
              size="sm"
              onPress={() => {
                clearFilters();
              }}
              full
            />
          </>
        }
      >
        <FilterGroup title="Category">
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              color={category.color}
              active={categoryIds.includes(category.id)}
              onPress={() => toggle(categoryIds, category.id, setCategoryIds)}
              compact
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Recorded by">
          {household.map((member) => (
            <Chip
              key={member.id}
              label={member.display_name}
              color={member.avatar_color}
              active={userIds.includes(member.id)}
              onPress={() => toggle(userIds, member.id, setUserIds)}
              compact
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
              compact
            />
          ))}
        </FilterGroup>
      </Sheet>
    </View>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.micro, { color: palette.textTertiary }]}>{title.toUpperCase()}</Text>
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
  const tint = txn.category?.color ?? palette.neutral;
  const linked = Boolean(txn.loan_payment_id || txn.settlement_payment_id);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${txn.title}, ${formatCurrency(txn.amount)}, ${txn.category?.name ?? 'uncategorised'}`}
      accessibilityHint="Opens the entry for editing"
    >
      <View style={[styles.row, !last && styles.rowBorder]}>
        <View style={[styles.rowIcon, { backgroundColor: `${tint}1F`, borderColor: `${tint}44` }]}>
          <View style={[styles.rowDot, { backgroundColor: tint }]} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={[typography.body, { color: palette.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
              {txn.title}
            </Text>
            {txn.scope === 'personal' ? <Pill label="Personal" color={palette.neutral} /> : null}
            {linked ? <Pill label="Linked" color={palette.info} /> : null}
          </View>
          <Text style={[typography.micro, { color: palette.textTertiary, marginTop: 3 }]} numberOfLines={1}>
            {txn.category?.name ?? 'Uncategorised'} · {titleCase(txn.payment_method)} · {txn.user.display_name}
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
  );
}

function formatPeriod(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  totalMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    paddingHorizontal: spacing.md,
    height: 44,
    justifyContent: 'center',
  },
  searchInput: { ...typography.body, color: palette.textPrimary, padding: 0 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
});
