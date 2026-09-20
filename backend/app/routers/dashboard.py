from __future__ import annotations

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import DB, CurrentUser
from app.models import Loan, Settlement, Transaction
from app.schemas.dashboard import CashFlowPoint, DashboardSummary, UpcomingPayment
from app.schemas.transaction import CategoryTotal, TransactionOut
from app.services.access import visibility_filter
from app.services.analytics import (
    category_breakdown,
    daily_cash_flow,
    lifetime_net_before,
    monthly_cash_flow,
    settlement_paid_map,
    totals_between,
    upcoming_payments,
)
from app.services.budgets import budget_overview
from app.services.finance import ZERO, change_pct, money, month_bounds

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummary)
def dashboard(
    db: DB,
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    range: str = Query(default="month", pattern="^(month|3m|6m|12m)$"),
) -> DashboardSummary:
    settings = get_settings()
    today = date.today()
    anchor = _anchor(month)
    start, end = month_bounds(anchor)

    opening = lifetime_net_before(db, user.id, start)
    income, expenses = totals_between(db, user.id, start, end)
    available = money(opening + income - expenses)

    prev_start, prev_end = month_bounds(start - timedelta(days=1))
    prev_income, prev_expenses = totals_between(db, user.id, prev_start, prev_end)

    if range == "month":
        flow = daily_cash_flow(db, user.id, start, end, opening)
    else:
        months = {"3m": 3, "6m": 6, "12m": 12}[range]
        flow = monthly_cash_flow(db, user.id, months, end)

    upcoming = upcoming_payments(db, user.id, today)
    commitments = money(sum((i["amount"] for i in upcoming if not i["is_overdue"]), ZERO))

    loans = list(
        db.scalars(
            select(Loan).where(
                Loan.deleted_at.is_(None), visibility_filter(Loan, user.id), Loan.status == "active"
            )
        ).all()
    )

    settlements = list(
        db.scalars(
            select(Settlement).where(
                Settlement.deleted_at.is_(None),
                visibility_filter(Settlement, user.id),
                Settlement.status != "settled",
            )
        ).all()
    )
    paid_map = settlement_paid_map(db, [s.id for s in settlements])
    we_owe = ZERO
    owed_to_us = ZERO
    for s in settlements:
        remaining = money(max(ZERO, money(s.total_amount) - paid_map.get(s.id, ZERO)))
        if s.direction == "we_owe":
            we_owe = money(we_owe + remaining)
        else:
            owed_to_us = money(owed_to_us + remaining)

    budgets = budget_overview(db, user.id, start, end, today)

    recent = db.scalars(
        select(Transaction)
        .where(Transaction.deleted_at.is_(None), visibility_filter(Transaction, user.id))
        .order_by(Transaction.occurred_on.desc(), Transaction.created_at.desc())
        .limit(6)
    ).all()

    demo_marker = db.scalar(
        select(Transaction.id).where(Transaction.import_batch_id == "demo-seed").limit(1)
    )

    return DashboardSummary(
        greeting_name=user.display_name,
        period_label=start.strftime("%B %Y"),
        period_start=start,
        period_end=end,
        currency=settings.currency,
        available_balance=available,
        opening_balance=opening,
        income=income,
        expenses=expenses,
        net=money(income - expenses),
        upcoming_commitments=commitments,
        income_change_pct=change_pct(income, prev_income),
        expense_change_pct=change_pct(expenses, prev_expenses),
        cash_flow=[CashFlowPoint(**point) for point in flow],
        upcoming_payments=[UpcomingPayment(**item) for item in upcoming[:8]],
        spending_by_category=[CategoryTotal(**c) for c in category_breakdown(db, user.id, start, end)],
        recent_transactions=[TransactionOut.model_validate(t) for t in recent],
        total_outstanding_debt=money(sum((money(l.outstanding_balance) for l in loans), ZERO)),
        monthly_emi_commitment=money(sum((money(l.emi_amount) for l in loans), ZERO)),
        we_owe_total=we_owe,
        owed_to_us_total=owed_to_us,
        budget_limit=budgets["total_limit"],
        budget_spent=budgets["total_spent"],
        budget_used_pct=budgets["used_pct"],
        is_demo_data=demo_marker is not None,
    )


def _anchor(month: str | None) -> date:
    if not month:
        return date.today()
    year, mon = month.split("-")
    return date(int(year), int(mon), 1)
