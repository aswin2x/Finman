"""Budget progress computation."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Budget, Transaction
from app.services.access import visibility_filter
from app.services.finance import ZERO, budget_state, daily_allowance, money, pct


def _spend_for(
    db: Session,
    user_id: uuid.UUID,
    start: date,
    end: date,
    category_id: uuid.UUID | None,
) -> Decimal:
    stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.deleted_at.is_(None),
        visibility_filter(Transaction, user_id),
        Transaction.type == "expense",
        Transaction.occurred_on >= start,
        Transaction.occurred_on <= end,
    )
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    return money(db.scalar(stmt))


def budget_progress(
    db: Session,
    user_id: uuid.UUID,
    budget: Budget,
    today: date,
    window: tuple[date, date] | None = None,
) -> dict:
    """Progress for one budget.

    `window` narrows the spend to a period being viewed, so a budget spanning
    several months reports what was spent in the month on screen rather than
    its whole run. Without it the budget's own period is used.
    """
    start = budget.period_start
    end = budget.period_end
    if window is not None:
        start = max(start, window[0])
        end = min(end, window[1])
        if end < start:
            start, end = window

    spent = _spend_for(db, user_id, start, end, budget.category_id)
    effective_limit = money(budget.limit_amount + (budget.rollover_amount if budget.rollover else ZERO))
    remaining = money(effective_limit - spent)
    used = pct(spent, effective_limit)
    days_remaining = max(0, (budget.period_end - max(today, budget.period_start)).days + 1)
    if today > budget.period_end:
        days_remaining = 0
    return {
        "budget": budget,
        "effective_limit": effective_limit,
        "spent": spent,
        "remaining": remaining,
        "used_pct": used,
        "state": budget_state(used, budget.alert_threshold_pct),
        "days_remaining": days_remaining,
        "daily_allowance": daily_allowance(remaining, days_remaining),
    }


def budget_overview(db: Session, user_id: uuid.UUID, start: date, end: date, today: date) -> dict:
    """Overview for a period.

    Category budgets are summed for the headline figure. An overall budget
    (category_id NULL) is reported separately so it is never double-counted.
    """
    budgets = db.scalars(
        select(Budget)
        .where(
            Budget.deleted_at.is_(None),
            visibility_filter(Budget, user_id),
            Budget.period_start <= end,
            Budget.period_end >= start,
        )
        .order_by(Budget.name)
    ).all()

    category_budgets = [b for b in budgets if b.category_id is not None]
    overall_budgets = [b for b in budgets if b.category_id is None]

    window = (start, end)
    progress = [budget_progress(db, user_id, b, today, window) for b in category_budgets]

    total_spent_period = _spend_for(db, user_id, start, end, None)

    # Two budgets can cover one category in a period, for instance a shared one
    # and someone's personal one. Their spend is the same money, so it is
    # counted once here even though each budget tracks its own progress.
    seen_categories: set = set()
    budgeted_spend = ZERO
    for entry in progress:
        category_id = entry["budget"].category_id
        if category_id in seen_categories:
            continue
        seen_categories.add(category_id)
        budgeted_spend = money(budgeted_spend + entry["spent"])

    if overall_budgets:
        overall = [budget_progress(db, user_id, b, today, window) for b in overall_budgets]
        total_limit = money(sum((o["effective_limit"] for o in overall), ZERO))
        total_spent = total_spent_period
    else:
        total_limit = money(sum((p["effective_limit"] for p in progress), ZERO))
        total_spent = budgeted_spend
        if len(seen_categories) < len(progress):
            # Overlapping budgets inflate the planned figure the same way, so
            # the headline uses the highest limit set for each category.
            best: dict = {}
            for entry in progress:
                key = entry["budget"].category_id
                best[key] = max(best.get(key, ZERO), entry["effective_limit"])
            total_limit = money(sum(best.values(), ZERO))

    used = pct(total_spent, total_limit)
    threshold = min((b.alert_threshold_pct for b in budgets), default=80)

    uncategorised = money(
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.deleted_at.is_(None),
                visibility_filter(Transaction, user_id),
                Transaction.type == "expense",
                Transaction.occurred_on >= start,
                Transaction.occurred_on <= end,
                Transaction.category_id.is_(None),
            )
        )
    )

    return {
        "period_start": start,
        "period_end": end,
        "total_limit": total_limit,
        "total_spent": total_spent,
        "total_remaining": money(total_limit - total_spent),
        "used_pct": used,
        "state": budget_state(used, threshold),
        "categories": progress,
        "uncategorised_spend": uncategorised,
        "unbudgeted_spend": money(max(ZERO, total_spent_period - budgeted_spend)),
    }
