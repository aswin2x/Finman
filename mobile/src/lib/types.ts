/** API contract types, mirroring the FastAPI Pydantic schemas. */

export type Scope = 'shared' | 'personal';
export type TxnType = 'expense' | 'income';
export type PaymentMethod = 'upi' | 'cash' | 'card' | 'bank' | 'wallet' | 'other';
export type DebtType = 'loan' | 'credit_card' | 'bnpl' | 'personal_due';
export type LoanStatus = 'active' | 'paused' | 'closed';
export type Direction = 'we_owe' | 'owed_to_us';
export type SettlementStatus = 'pending' | 'partial' | 'settled';
export type Frequency = 'weekly' | 'monthly' | 'yearly';
export type BudgetState = 'on_track' | 'warning' | 'over';

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Category {
  id: string;
  name: string;
  kind: TxnType;
  icon: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  owner_id: string | null;
}

export interface UserBrief {
  id: string;
  display_name: string;
  avatar_color: string;
}

export interface Transaction {
  id: string;
  type: TxnType;
  amount: number;
  title: string;
  notes: string | null;
  occurred_on: string;
  payment_method: PaymentMethod;
  scope: Scope;
  category_id: string | null;
  category: Category | null;
  user_id: string;
  user: UserBrief;
  recurring_rule_id: string | null;
  loan_payment_id: string | null;
  settlement_payment_id: string | null;
  is_imported: boolean;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  color: string;
  icon: string;
  amount: number;
  count: number;
  share_pct: number;
}

export interface MonthlySummary {
  month: string;
  income: number;
  expenses: number;
  net: number;
  expense_count: number;
  income_count: number;
  by_category: CategoryTotal[];
  by_user: { user_id: string; display_name: string; avatar_color: string; amount: number; count: number }[];
  by_payment_method: { payment_method: PaymentMethod; amount: number; count: number }[];
}

export interface CashFlowPoint {
  label: string;
  date: string;
  income: number;
  expenses: number;
  net: number;
  cumulative_net: number;
}

export interface UpcomingPayment {
  id: string;
  source: 'loan' | 'recurring' | 'settlement';
  title: string;
  subtitle: string | null;
  amount: number;
  due_date: string | null;
  days_until: number | null;
  is_overdue: boolean;
}

export interface DashboardSummary {
  greeting_name: string;
  period_label: string;
  period_start: string;
  period_end: string;
  currency: string;
  available_balance: number;
  opening_balance: number;
  income: number;
  expenses: number;
  net: number;
  upcoming_commitments: number;
  income_change_pct: number | null;
  expense_change_pct: number | null;
  cash_flow: CashFlowPoint[];
  upcoming_payments: UpcomingPayment[];
  spending_by_category: CategoryTotal[];
  recent_transactions: Transaction[];
  total_outstanding_debt: number;
  monthly_emi_commitment: number;
  we_owe_total: number;
  owed_to_us_total: number;
  budget_limit: number;
  budget_spent: number;
  budget_used_pct: number;
  is_demo_data: boolean;
}

export interface Budget {
  id: string;
  name: string;
  limit_amount: number;
  period_type: 'monthly' | 'custom';
  period_start: string;
  period_end: string;
  rollover: boolean;
  rollover_amount: number;
  alert_threshold_pct: number;
  scope: Scope;
  category_id: string | null;
  category: Category | null;
  user_id: string;
}

export interface BudgetProgress {
  budget: Budget;
  effective_limit: number;
  spent: number;
  remaining: number;
  used_pct: number;
  state: BudgetState;
  days_remaining: number;
  daily_allowance: number;
}

export interface BudgetOverview {
  period_start: string;
  period_end: string;
  total_limit: number;
  total_spent: number;
  total_remaining: number;
  used_pct: number;
  state: BudgetState;
  categories: BudgetProgress[];
  uncategorised_spend: number;
  unbudgeted_spend: number;
}

export interface Loan {
  id: string;
  name: string;
  lender: string | null;
  debt_type: DebtType;
  principal_amount: number;
  outstanding_balance: number;
  emi_amount: number;
  interest_rate_annual: number | null;
  tenure_months: number | null;
  months_paid: number;
  start_date: string | null;
  due_day: number;
  next_due_date: string | null;
  status: LoanStatus;
  notes: string | null;
  scope: Scope;
  category_id: string | null;
  user_id: string;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  amount: number;
  paid_on: string;
  payment_type: 'emi' | 'extra' | 'charge';
  principal_component: number | null;
  interest_component: number | null;
  note: string | null;
  paid_by_user_id: string;
  transaction_id: string | null;
}

export interface LoanDetail extends Loan {
  payments: LoanPayment[];
  total_paid: number;
  remaining_months_estimate: number | null;
  expected_completion: string | null;
  progress_pct: number;
}

export interface DebtSummary {
  total_outstanding: number;
  monthly_emi_commitment: number;
  active_count: number;
  closed_count: number;
  by_type: { debt_type: DebtType; outstanding: number; emi: number; count: number }[];
  next_due: { id: string; name: string; amount: number; due_date: string; days_until: number }[];
}

export interface Settlement {
  id: string;
  person_name: string;
  direction: Direction;
  total_amount: number;
  expected_date: string | null;
  status: SettlementStatus;
  notes: string | null;
  is_verified: boolean;
  scope: Scope;
  user_id: string;
  paid_amount: number;
  remaining_amount: number;
}

export interface SettlementPayment {
  id: string;
  settlement_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  recorded_by_user_id: string;
  transaction_id: string | null;
}

export interface SettlementDetail extends Settlement {
  payments: SettlementPayment[];
}

export interface SettlementSummary {
  we_owe_total: number;
  owed_to_us_total: number;
  net_position: number;
  pending_count: number;
  settled_count: number;
  unverified_count: number;
}

export interface RecurringRule {
  id: string;
  title: string;
  type: TxnType;
  amount: number;
  frequency: Frequency;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  next_run_on: string;
  is_active: boolean;
  auto_post: boolean;
  payment_method: PaymentMethod;
  scope: Scope;
  category_id: string | null;
  category: Category | null;
  user_id: string;
}

export interface ForecastAdjustment {
  kind: 'income_delta' | 'expense_delta' | 'one_off' | 'new_recurring';
  label: string;
  amount: number;
  starts_on?: string | null;
  ends_on?: string | null;
}

export interface ForecastMonth {
  month: string;
  month_start: string;
  projected_income: number;
  projected_expenses: number;
  projected_emi: number;
  projected_savings: number;
  projected_closing_balance: number;
  loans_closing_this_month: string[];
  is_estimate: boolean;
}

export interface ForecastResponse {
  generated_on: string;
  horizon_months: number;
  actual_balance: number;
  budgeted_monthly_expense: number;
  baseline_monthly_income: number;
  baseline_monthly_expense: number;
  baseline_monthly_emi: number;
  months: ForecastMonth[];
  projected_end_balance: number;
  total_projected_savings: number;
  debt_free_month: string | null;
  disclaimer: string;
}

export interface Scenario {
  id: string;
  name: string;
  horizon_months: number;
  adjustments: { items?: ForecastAdjustment[] };
  user_id: string;
}

export interface ScenarioComparison {
  base: ForecastResponse;
  scenario: ForecastResponse;
  end_balance_delta: number;
  savings_delta: number;
}

export interface ImportPreview {
  total_rows: number;
  valid_count: number;
  error_count: number;
  sample: { row: number; occurred_on: string; type: TxnType; title: string; amount: number; category: string | null }[];
  errors: { row: number; error: string }[];
}
