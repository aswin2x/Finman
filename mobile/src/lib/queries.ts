/**
 * React Query hooks: one place for every server interaction.
 *
 * Mutations invalidate the derived views they can affect. A loan payment, for
 * example, changes the loan, the dashboard and the transaction list, so all
 * three are refreshed rather than patched optimistically. Balances are never
 * guessed on the client.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import { http, query } from './api';
import type {
  Budget,
  BudgetOverview,
  BudgetProgress,
  Category,
  DashboardSummary,
  DebtSummary,
  ForecastAdjustment,
  ForecastResponse,
  ImportPreview,
  Loan,
  LoanDetail,
  MonthlySummary,
  Page,
  RecurringRule,
  Scenario,
  ScenarioComparison,
  Settlement,
  SettlementDetail,
  SettlementSummary,
  Transaction,
  User,
} from './types';

export const keys = {
  me: ['me'] as const,
  household: ['household'] as const,
  dashboard: (month?: string, range?: string) => ['dashboard', month ?? 'current', range ?? 'month'] as const,
  categories: (kind?: string) => ['categories', kind ?? 'all'] as const,
  transactions: (filters: Record<string, unknown>) => ['transactions', filters] as const,
  transaction: (id: string) => ['transaction', id] as const,
  summary: (month?: string) => ['summary', month ?? 'current'] as const,
  budgets: (month?: string) => ['budgets', month ?? 'current'] as const,
  budgetOverview: (month?: string) => ['budget-overview', month ?? 'current'] as const,
  loans: (filters?: Record<string, unknown>) => ['loans', filters ?? {}] as const,
  loan: (id: string) => ['loan', id] as const,
  debtSummary: ['debt-summary'] as const,
  settlements: (filters?: Record<string, unknown>) => ['settlements', filters ?? {}] as const,
  settlement: (id: string) => ['settlement', id] as const,
  settlementSummary: ['settlement-summary'] as const,
  recurring: ['recurring'] as const,
  forecast: (horizon: number, adjustments: unknown) => ['forecast', horizon, adjustments] as const,
  scenarios: ['scenarios'] as const,
  scenarioCompare: (id: string) => ['scenario-compare', id] as const,
};

/** Views that can change when money moves anywhere in the app. */
const MONEY_VIEWS = ['dashboard', 'transactions', 'summary', 'budgets', 'budget-overview', 'forecast'];

function useInvalidator() {
  const client = useQueryClient();
  return (extra: string[] = []) => {
    [...MONEY_VIEWS, ...extra].forEach((key) => {
      client.invalidateQueries({ queryKey: [key] });
    });
  };
}

/* ---------------------------------------------------------------- identity */

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: () => http.get<User>('/auth/me'), enabled });
}

export function useHousehold(enabled = true) {
  return useQuery({
    queryKey: keys.household,
    queryFn: () => http.get<User[]>('/auth/household'),
    staleTime: 1000 * 60 * 30,
    enabled,
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { display_name?: string; avatar_color?: string }) => http.patch<User>('/auth/me', body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.me });
      client.invalidateQueries({ queryKey: keys.household });
      client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      http.post<{ detail: string }>('/auth/change-password', body),
  });
}

/* --------------------------------------------------------------- dashboard */

export function useDashboard(month?: string, range: 'month' | '3m' | '6m' | '12m' = 'month') {
  return useQuery({
    queryKey: keys.dashboard(month, range),
    queryFn: () => http.get<DashboardSummary>(`/dashboard${query({ month, range })}`),
    staleTime: 1000 * 30,
  });
}

/* -------------------------------------------------------------- categories */

export function useCategories(kind?: 'expense' | 'income') {
  return useQuery({
    queryKey: keys.categories(kind),
    queryFn: () => http.get<Category[]>(`/categories${query({ kind })}`),
    staleTime: 1000 * 60 * 10,
  });
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Category> & { name: string; is_personal?: boolean }) =>
      http.post<Category>('/categories', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Category>) =>
      http.patch<Category>(`/categories/${id}`, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['categories'] });
      invalidate();
    },
  });
}

export function useDeleteCategory() {
  const client = useQueryClient();
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/categories/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['categories'] });
      invalidate();
    },
  });
}

/* ------------------------------------------------------------ transactions */

export interface TransactionFilters extends Record<string, unknown> {
  type?: 'expense' | 'income';
  category_id?: string[];
  user_id?: string[];
  payment_method?: string[];
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  scope?: string;
  limit?: number;
  offset?: number;
}

export function useTransactions(filters: TransactionFilters = {}, options?: Partial<UseQueryOptions<Page<Transaction>>>) {
  return useQuery({
    queryKey: keys.transactions(filters),
    queryFn: () => http.get<Page<Transaction>>(`/transactions${query(filters as Record<string, unknown>)}`),
    ...options,
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: keys.transaction(id ?? ''),
    queryFn: () => http.get<Transaction>(`/transactions/${id}`),
    enabled: Boolean(id),
  });
}

export function useMonthlySummary(month?: string) {
  return useQuery({
    queryKey: keys.summary(month),
    queryFn: () => http.get<MonthlySummary>(`/transactions/summary${query({ month })}`),
  });
}

export interface TransactionInput {
  type: 'expense' | 'income';
  amount: number;
  title: string;
  notes?: string | null;
  occurred_on: string;
  payment_method: string;
  scope: string;
  category_id?: string | null;
  user_id?: string | null;
}

export function useCreateTransaction() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (body: TransactionInput) => http.post<Transaction>('/transactions', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<TransactionInput>) =>
      http.patch<Transaction>(`/transactions/${id}`, body),
    onSuccess: () => invalidate(['transaction']),
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/transactions/${id}`),
    onSuccess: () => invalidate(),
  });
}

/** Restores a soft-deleted entry, backing the undo affordance. */
export function useRestoreTransaction() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.post<Transaction>(`/transactions/${id}/restore`),
    onSuccess: () => invalidate(),
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (form: FormData) => http.postForm<ImportPreview>('/transactions/import/preview', form),
  });
}

export function useImportCommit() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (form: FormData) =>
      http.postForm<{ imported: number; skipped: number; batch_id: string }>('/transactions/import', form),
    onSuccess: () => invalidate(['categories']),
  });
}

export function useUndoImport() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (batchId: string) => http.del<{ detail: string }>(`/transactions/import/${batchId}`),
    onSuccess: () => invalidate(),
  });
}

/* ------------------------------------------------------------------ budgets */

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: keys.budgets(month),
    queryFn: () => http.get<BudgetProgress[]>(`/budgets${query({ month })}`),
  });
}

export function useBudgetOverview(month?: string) {
  return useQuery({
    queryKey: keys.budgetOverview(month),
    queryFn: () => http.get<BudgetOverview>(`/budgets/overview${query({ month })}`),
  });
}

export interface BudgetInput {
  name: string;
  limit_amount: number;
  period_type?: 'monthly' | 'custom';
  period_start: string;
  period_end: string;
  rollover?: boolean;
  alert_threshold_pct?: number;
  scope?: string;
  category_id?: string | null;
}

export function useCreateBudget() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (body: BudgetInput) => http.post<BudgetProgress>('/budgets', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBudget() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<BudgetInput>) =>
      http.patch<BudgetProgress>(`/budgets/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteBudget() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/budgets/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useRollForwardBudgets() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      http.post<Budget[]>(`/budgets/roll-forward${query({ from_month: from, to_month: to })}`),
    onSuccess: () => invalidate(),
  });
}

/* -------------------------------------------------------------------- debts */

export function useLoans(filters: { debt_type?: string; status?: string } = {}) {
  return useQuery({
    queryKey: keys.loans(filters),
    queryFn: () => http.get<Loan[]>(`/loans${query(filters)}`),
  });
}

export function useLoan(id: string | undefined) {
  return useQuery({
    queryKey: keys.loan(id ?? ''),
    queryFn: () => http.get<LoanDetail>(`/loans/${id}`),
    enabled: Boolean(id),
  });
}

export function useDebtSummary() {
  return useQuery({ queryKey: keys.debtSummary, queryFn: () => http.get<DebtSummary>('/loans/summary') });
}

export interface LoanInput {
  name: string;
  lender?: string | null;
  debt_type: string;
  principal_amount: number;
  outstanding_balance: number;
  emi_amount: number;
  interest_rate_annual?: number | null;
  tenure_months?: number | null;
  months_paid?: number;
  start_date?: string | null;
  due_day: number;
  next_due_date?: string | null;
  status?: string;
  notes?: string | null;
  scope?: string;
  category_id?: string | null;
}

export function useCreateLoan() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (body: LoanInput) => http.post<LoanDetail>('/loans', body),
    onSuccess: () => invalidate(['loans', 'debt-summary']),
  });
}

export function useUpdateLoan() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<LoanInput>) =>
      http.patch<LoanDetail>(`/loans/${id}`, body),
    onSuccess: () => invalidate(['loans', 'loan', 'debt-summary']),
  });
}

export function useDeleteLoan() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/loans/${id}`),
    onSuccess: () => invalidate(['loans', 'debt-summary']),
  });
}

export function useRecordLoanPayment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ loanId, ...body }: { loanId: string; amount: number; paid_on: string; payment_type?: string; principal_component?: number | null; interest_component?: number | null; note?: string | null; create_expense?: boolean }) =>
      http.post<LoanDetail>(`/loans/${loanId}/payments`, body),
    onSuccess: () => invalidate(['loans', 'loan', 'debt-summary']),
  });
}

export function useDeleteLoanPayment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ loanId, paymentId }: { loanId: string; paymentId: string }) =>
      http.del<LoanDetail>(`/loans/${loanId}/payments/${paymentId}`),
    onSuccess: () => invalidate(['loans', 'loan', 'debt-summary']),
  });
}

/* -------------------------------------------------------------- settlements */

export function useSettlements(filters: { direction?: string; status?: string; person?: string } = {}) {
  return useQuery({
    queryKey: keys.settlements(filters),
    queryFn: () => http.get<Settlement[]>(`/settlements${query(filters)}`),
  });
}

export function useSettlement(id: string | undefined) {
  return useQuery({
    queryKey: keys.settlement(id ?? ''),
    queryFn: () => http.get<SettlementDetail>(`/settlements/${id}`),
    enabled: Boolean(id),
  });
}

export function useSettlementSummary() {
  return useQuery({
    queryKey: keys.settlementSummary,
    queryFn: () => http.get<SettlementSummary>('/settlements/summary'),
  });
}

export interface SettlementInput {
  person_name: string;
  direction: string;
  total_amount: number;
  expected_date?: string | null;
  notes?: string | null;
  is_verified?: boolean;
  scope?: string;
}

export function useCreateSettlement() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (body: SettlementInput) => http.post<SettlementDetail>('/settlements', body),
    onSuccess: () => invalidate(['settlements', 'settlement-summary']),
  });
}

export function useUpdateSettlement() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<SettlementInput> & { status?: string }) =>
      http.patch<SettlementDetail>(`/settlements/${id}`, body),
    onSuccess: () => invalidate(['settlements', 'settlement', 'settlement-summary']),
  });
}

export function useDeleteSettlement() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/settlements/${id}`),
    onSuccess: () => invalidate(['settlements', 'settlement-summary']),
  });
}

export function useRecordSettlementPayment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ settlementId, ...body }: { settlementId: string; amount: number; paid_on: string; note?: string | null; create_expense?: boolean }) =>
      http.post<SettlementDetail>(`/settlements/${settlementId}/payments`, body),
    onSuccess: () => invalidate(['settlements', 'settlement', 'settlement-summary']),
  });
}

export function useDeleteSettlementPayment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ settlementId, paymentId }: { settlementId: string; paymentId: string }) =>
      http.del<SettlementDetail>(`/settlements/${settlementId}/payments/${paymentId}`),
    onSuccess: () => invalidate(['settlements', 'settlement', 'settlement-summary']),
  });
}

/* --------------------------------------------------------------- recurring */

export function useRecurring(activeOnly = true) {
  return useQuery({
    queryKey: [...keys.recurring, activeOnly],
    queryFn: () => http.get<RecurringRule[]>(`/recurring${query({ active_only: activeOnly })}`),
  });
}

export interface RecurringInput {
  title: string;
  type: 'expense' | 'income';
  amount: number;
  frequency: string;
  day_of_month: number;
  start_date: string;
  end_date?: string | null;
  is_active?: boolean;
  auto_post?: boolean;
  payment_method: string;
  scope: string;
  category_id?: string | null;
}

export function useCreateRecurring() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (body: RecurringInput) => http.post<RecurringRule>('/recurring', body),
    onSuccess: () => invalidate(['recurring']),
  });
}

export function useUpdateRecurring() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<RecurringInput>) =>
      http.patch<RecurringRule>(`/recurring/${id}`, body),
    onSuccess: () => invalidate(['recurring']),
  });
}

export function useDeleteRecurring() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/recurring/${id}`),
    onSuccess: () => invalidate(['recurring']),
  });
}

export function usePostRecurring() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on?: string }) =>
      http.post<Transaction>(`/recurring/${id}/post${query({ on })}`),
    onSuccess: () => invalidate(['recurring']),
  });
}

/* ---------------------------------------------------------------- forecast */

export function useForecast(horizon: 1 | 3 | 6 | 12, adjustments: ForecastAdjustment[] = [], overrides?: { income?: number; expense?: number }) {
  return useQuery({
    queryKey: keys.forecast(horizon, { adjustments, overrides }),
    queryFn: () =>
      http.post<ForecastResponse>('/forecast', {
        horizon_months: horizon,
        adjustments,
        monthly_income_override: overrides?.income,
        monthly_expense_override: overrides?.expense,
      }),
  });
}

export function useScenarios() {
  return useQuery({ queryKey: keys.scenarios, queryFn: () => http.get<Scenario[]>('/forecast/scenarios') });
}

export function useCreateScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; horizon_months: number; adjustments: ForecastAdjustment[] }) =>
      http.post<Scenario>('/forecast/scenarios', body),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.scenarios }),
  });
}

export function useUpdateScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; horizon_months?: number; adjustments?: ForecastAdjustment[] }) =>
      http.patch<Scenario>(`/forecast/scenarios/${id}`, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.scenarios });
      client.invalidateQueries({ queryKey: ['scenario-compare'] });
    },
  });
}

export function useDeleteScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del<{ detail: string }>(`/forecast/scenarios/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.scenarios }),
  });
}

export function useScenarioComparison(id: string | undefined) {
  return useQuery({
    queryKey: keys.scenarioCompare(id ?? ''),
    queryFn: () => http.get<ScenarioComparison>(`/forecast/scenarios/${id}/compare`),
    enabled: Boolean(id),
  });
}
