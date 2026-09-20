from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.common import Money
from app.schemas.transaction import CategoryTotal, TransactionOut


class CashFlowPoint(BaseModel):
    """One point on the cash-flow chart."""

    label: str
    date: date
    income: Money
    expenses: Money
    net: Money
    cumulative_net: Money


class UpcomingPayment(BaseModel):
    id: uuid.UUID
    source: str  # loan | recurring | settlement
    title: str
    subtitle: str | None
    amount: Money
    due_date: date | None
    days_until: int | None
    is_overdue: bool


class DashboardSummary(BaseModel):
    """Everything the home screen needs in a single request.

    `available_balance` is a computed cash position for the period. It is not
    a synced bank balance; the client labels it accordingly.
    """

    greeting_name: str
    period_label: str
    period_start: date
    period_end: date
    currency: str

    available_balance: Money
    opening_balance: Money
    income: Money
    expenses: Money
    net: Money
    upcoming_commitments: Money

    income_change_pct: float | None
    expense_change_pct: float | None

    cash_flow: list[CashFlowPoint]
    upcoming_payments: list[UpcomingPayment]
    spending_by_category: list[CategoryTotal]
    recent_transactions: list[TransactionOut]

    total_outstanding_debt: Money
    monthly_emi_commitment: Money
    we_owe_total: Money
    owed_to_us_total: Money

    budget_limit: Money
    budget_spent: Money
    budget_used_pct: float

    is_demo_data: bool
