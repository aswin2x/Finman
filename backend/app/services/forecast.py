"""Forward-looking projections.

Every number produced here is an estimate. The only actual figure returned is
`actual_balance`, which is the derived cash position from recorded history.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Loan, RecurringRule
from app.services.access import visibility_filter
from app.services.analytics import lifetime_net_before, totals_between
from app.services.finance import ZERO, money, month_bounds, months_to_clear

HISTORY_MONTHS = 3


def baseline_monthly_income(db: Session, user_id: uuid.UUID, today: date) -> Decimal:
    """Recurring income if defined, else the average of recent recorded income."""
    rules = db.scalars(
        select(RecurringRule).where(
            RecurringRule.deleted_at.is_(None),
            visibility_filter(RecurringRule, user_id),
            RecurringRule.is_active.is_(True),
            RecurringRule.type == "income",
            RecurringRule.frequency == "monthly",
        )
    ).all()
    if rules:
        return money(sum((money(r.amount) for r in rules), ZERO))
    return _average_recent(db, user_id, today, "income")


def baseline_monthly_expense(db: Session, user_id: uuid.UUID, today: date) -> Decimal:
    """Average recorded expense per month, excluding debt repayments.

    EMI is projected separately from live loan balances, so counting the
    historical EMI outflow here as well would double the commitment.
    """
    return _average_recent(db, user_id, today, "expense")


def _monthly_expense_excluding_debt(db: Session, user_id: uuid.UUID, start: date, end: date) -> Decimal:
    """Expenses for a month, less anything that was a recorded debt payment.

    Only entries actually linked to a loan payment are excluded. Excluding a
    whole category would also drop ordinary spending that happens to share it,
    for instance a bank charge filed under the same heading as the EMIs.
    """
    from sqlalchemy import func

    from app.models import Transaction

    stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.deleted_at.is_(None),
        visibility_filter(Transaction, user_id),
        Transaction.type == "expense",
        Transaction.occurred_on >= start,
        Transaction.occurred_on <= end,
        Transaction.loan_payment_id.is_(None),
    )
    return money(db.scalar(stmt))


def _average_recent(db: Session, user_id: uuid.UUID, today: date, kind: str) -> Decimal:
    """Average over the recent months, counting a quiet month as a real zero.

    Dropping empty months would report a single busy month as the norm.
    """
    totals: list[Decimal] = []
    for offset in range(1, HISTORY_MONTHS + 1):
        anchor = today.replace(day=1) - relativedelta(months=offset)
        start, end = month_bounds(anchor)
        if kind == "income":
            income, _ = totals_between(db, user_id, start, end)
            totals.append(income)
        else:
            totals.append(_monthly_expense_excluding_debt(db, user_id, start, end))

    if any(t > ZERO for t in totals):
        return money(sum(totals, ZERO) / Decimal(len(totals)))

    # No history at all, so fall back to the month in progress rather than
    # projecting zero for an account that is simply new.
    start, end = month_bounds(today)
    if kind == "income":
        income, _ = totals_between(db, user_id, start, end)
        return income
    return _monthly_expense_excluding_debt(db, user_id, start, end)


def _emi_schedule(db: Session, user_id: uuid.UUID, months: int, today: date) -> list[dict]:
    """Per-month EMI outflow, dropping each loan once its balance is cleared."""
    loans = db.scalars(
        select(Loan).where(
            Loan.deleted_at.is_(None),
            visibility_filter(Loan, user_id),
            Loan.status == "active",
            Loan.emi_amount > 0,
        )
    ).all()

    remaining_months: dict[uuid.UUID, int] = {}
    for loan in loans:
        left = months_to_clear(loan.outstanding_balance, loan.emi_amount, loan.interest_rate_annual)
        if left is None:
            # EMI never clears the balance at this rate; assume it runs the whole horizon.
            left = months
        remaining_months[loan.id] = left

    schedule: list[dict] = []
    for index in range(months):
        payable = ZERO
        closing: list[str] = []
        for loan in loans:
            left = remaining_months[loan.id]
            if index < left:
                payable = money(payable + money(loan.emi_amount))
                if index == left - 1:
                    closing.append(loan.name)
        schedule.append({"emi": payable, "closing": closing})
    return schedule


def _adjustment_amount(adjustments: list[dict], kind: str, month_start: date, month_end: date) -> Decimal:
    delta = ZERO
    for adj in adjustments:
        if adj.get("kind") != kind:
            continue
        starts = adj.get("starts_on")
        ends = adj.get("ends_on")
        if starts and starts > month_end:
            continue
        if ends and ends < month_start:
            continue
        delta = money(delta + money(adj.get("amount", 0)))
    return delta


def build_forecast(
    db: Session,
    user_id: uuid.UUID,
    today: date,
    horizon_months: int,
    adjustments: list[dict] | None = None,
    income_override: Decimal | None = None,
    expense_override: Decimal | None = None,
    budgeted_monthly_expense: Decimal | None = None,
) -> dict:
    adjustments = adjustments or []
    actual_balance = money(
        lifetime_net_before(db, user_id, today + relativedelta(days=1))
    )

    base_income = money(income_override) if income_override is not None else baseline_monthly_income(db, user_id, today)
    base_expense = (
        money(expense_override) if expense_override is not None else baseline_monthly_expense(db, user_id, today)
    )
    emi_schedule = _emi_schedule(db, user_id, horizon_months, today)
    base_emi = emi_schedule[0]["emi"] if emi_schedule else ZERO

    months: list[dict] = []
    balance = actual_balance
    debt_free_month: str | None = None

    for index in range(horizon_months):
        anchor = (today.replace(day=1) + relativedelta(months=index + 1))
        start, end = month_bounds(anchor)

        income = money(base_income + _adjustment_amount(adjustments, "income_delta", start, end))
        expense = money(base_expense + _adjustment_amount(adjustments, "expense_delta", start, end))
        expense = money(expense + _adjustment_amount(adjustments, "new_recurring", start, end))
        expense = money(expense + _adjustment_amount(adjustments, "one_off", start, end))
        expense = max(ZERO, expense)

        emi = emi_schedule[index]["emi"] if index < len(emi_schedule) else ZERO
        closing = emi_schedule[index]["closing"] if index < len(emi_schedule) else []

        savings = money(income - expense - emi)
        balance = money(balance + savings)

        if debt_free_month is None and index + 1 < len(emi_schedule) and emi_schedule[index + 1]["emi"] == ZERO and emi > ZERO:
            debt_free_month = start.strftime("%B %Y")

        months.append(
            {
                "month": start.strftime("%b %Y"),
                "month_start": start,
                "projected_income": income,
                "projected_expenses": expense,
                "projected_emi": emi,
                "projected_savings": savings,
                "projected_closing_balance": balance,
                "loans_closing_this_month": closing,
                "is_estimate": True,
            }
        )

    return {
        "generated_on": today,
        "horizon_months": horizon_months,
        "actual_balance": actual_balance,
        "budgeted_monthly_expense": money(budgeted_monthly_expense) if budgeted_monthly_expense is not None else ZERO,
        "baseline_monthly_income": base_income,
        "baseline_monthly_expense": base_expense,
        "baseline_monthly_emi": base_emi,
        "months": months,
        "projected_end_balance": balance,
        "total_projected_savings": money(sum((m["projected_savings"] for m in months), ZERO)),
        "debt_free_month": debt_free_month,
    }
