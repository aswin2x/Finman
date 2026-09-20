"""Aggregations that power the dashboard, expense summary and charts."""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Select, and_, func, select
from sqlalchemy.orm import Session

from app.models import Category, Loan, RecurringRule, Settlement, SettlementPayment, Transaction, User
from app.services.access import visibility_filter
from app.services.finance import ZERO, money, month_bounds, next_due_after, pct, safe_day


def visible_transactions(user_id: uuid.UUID) -> Select:
    return select(Transaction).where(
        Transaction.deleted_at.is_(None),
        visibility_filter(Transaction, user_id),
    )


def _sum_expr(txn_type: str):
    return func.coalesce(
        func.sum(Transaction.amount).filter(Transaction.type == txn_type),
        0,
    )


def totals_between(db: Session, user_id: uuid.UUID, start: date, end: date) -> tuple[Decimal, Decimal]:
    """(income, expenses) for a date range, inclusive."""
    row = db.execute(
        select(_sum_expr("income"), _sum_expr("expense")).where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user_id),
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
    ).one()
    return money(row[0]), money(row[1])


def lifetime_net_before(db: Session, user_id: uuid.UUID, before: date) -> Decimal:
    """Net cash position accumulated from every record before `before`.

    This is the opening balance for a period. It is a derived cash position,
    not a bank balance.
    """
    row = db.execute(
        select(_sum_expr("income"), _sum_expr("expense")).where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user_id),
            Transaction.occurred_on < before,
        )
    ).one()
    return money(money(row[0]) - money(row[1]))


def category_breakdown(
    db: Session,
    user_id: uuid.UUID,
    start: date,
    end: date,
    txn_type: str = "expense",
) -> list[dict]:
    rows = db.execute(
        select(
            Transaction.category_id,
            func.coalesce(Category.name, "Uncategorised"),
            func.coalesce(Category.color, "#8A8F98"),
            func.coalesce(Category.icon, "tag"),
            func.sum(Transaction.amount),
            func.count(Transaction.id),
        )
        .join(Category, Category.id == Transaction.category_id, isouter=True)
        .where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user_id),
            Transaction.type == txn_type,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .group_by(Transaction.category_id, Category.name, Category.color, Category.icon)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()

    grand = money(sum((money(r[4]) for r in rows), ZERO))
    return [
        {
            "category_id": r[0],
            "name": r[1],
            "color": r[2],
            "icon": r[3],
            "amount": money(r[4]),
            "count": int(r[5]),
            "share_pct": pct(money(r[4]), grand),
        }
        for r in rows
    ]


def user_breakdown(db: Session, user_id: uuid.UUID, start: date, end: date) -> list[dict]:
    rows = db.execute(
        select(User.id, User.display_name, User.avatar_color, func.sum(Transaction.amount), func.count(Transaction.id))
        .join(User, User.id == Transaction.user_id)
        .where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user_id),
            Transaction.type == "expense",
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .group_by(User.id, User.display_name, User.avatar_color)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    return [
        {
            "user_id": str(r[0]),
            "display_name": r[1],
            "avatar_color": r[2],
            "amount": float(money(r[3])),
            "count": int(r[4]),
        }
        for r in rows
    ]


def payment_method_breakdown(db: Session, user_id: uuid.UUID, start: date, end: date) -> list[dict]:
    rows = db.execute(
        select(Transaction.payment_method, func.sum(Transaction.amount), func.count(Transaction.id))
        .where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user_id),
            Transaction.type == "expense",
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .group_by(Transaction.payment_method)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    return [
        {"payment_method": r[0], "amount": float(money(r[1])), "count": int(r[2])}
        for r in rows
    ]


def daily_cash_flow(
    db: Session, user_id: uuid.UUID, start: date, end: date, opening: Decimal
) -> list[dict]:
    """Per-day income/expense series with a running cumulative net."""
    rows = db.execute(
        select(Transaction.occurred_on, _sum_expr("income"), _sum_expr("expense"))
        .where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user_id),
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .group_by(Transaction.occurred_on)
        .order_by(Transaction.occurred_on)
    ).all()

    by_day = {r[0]: (money(r[1]), money(r[2])) for r in rows}
    points: list[dict] = []
    cumulative = money(opening)
    cursor = start
    while cursor <= end:
        income, expense = by_day.get(cursor, (ZERO, ZERO))
        net = money(income - expense)
        cumulative = money(cumulative + net)
        points.append(
            {
                "label": cursor.strftime("%d %b"),
                "date": cursor,
                "income": income,
                "expenses": expense,
                "net": net,
                "cumulative_net": cumulative,
            }
        )
        cursor += timedelta(days=1)
    return points


def monthly_cash_flow(db: Session, user_id: uuid.UUID, months: int, anchor: date) -> list[dict]:
    """Aggregated by month, used for the longer-range chart ranges."""
    from dateutil.relativedelta import relativedelta

    first_month = (anchor.replace(day=1) - relativedelta(months=months - 1))
    opening = lifetime_net_before(db, user_id, first_month)
    points: list[dict] = []
    cumulative = opening
    cursor = first_month
    while cursor <= anchor.replace(day=1):
        start, end = month_bounds(cursor)
        income, expense = totals_between(db, user_id, start, end)
        net = money(income - expense)
        cumulative = money(cumulative + net)
        points.append(
            {
                "label": cursor.strftime("%b"),
                "date": start,
                "income": income,
                "expenses": expense,
                "net": net,
                "cumulative_net": cumulative,
            }
        )
        cursor += relativedelta(months=1)
    return points


def upcoming_payments(db: Session, user_id: uuid.UUID, today: date, horizon_days: int = 45) -> list[dict]:
    """Loans, recurring expenses and dated settlements due soon, earliest first."""
    horizon = today + timedelta(days=horizon_days)
    items: list[dict] = []

    loans = db.scalars(
        select(Loan).where(
            Loan.deleted_at.is_(None),
            visibility_filter(Loan, user_id),
            Loan.status == "active",
            Loan.emi_amount > 0,
        )
    ).all()
    for loan in loans:
        due = loan.next_due_date or next_due_after(None, loan.due_day, today - timedelta(days=1))
        if due > horizon:
            continue
        items.append(
            {
                "id": loan.id,
                "source": "loan",
                "title": loan.name,
                "subtitle": loan.lender or loan.debt_type.replace("_", " ").title(),
                "amount": money(loan.emi_amount),
                "due_date": due,
                "days_until": (due - today).days,
                "is_overdue": due < today,
            }
        )

    rules = db.scalars(
        select(RecurringRule).where(
            RecurringRule.deleted_at.is_(None),
            visibility_filter(RecurringRule, user_id),
            RecurringRule.is_active.is_(True),
            RecurringRule.type == "expense",
        )
    ).all()
    for rule in rules:
        if rule.next_run_on > horizon:
            continue
        items.append(
            {
                "id": rule.id,
                "source": "recurring",
                "title": rule.title,
                "subtitle": rule.category.name if rule.category else "Recurring",
                "amount": money(rule.amount),
                "due_date": rule.next_run_on,
                "days_until": (rule.next_run_on - today).days,
                "is_overdue": rule.next_run_on < today,
            }
        )

    settlements = db.scalars(
        select(Settlement).where(
            Settlement.deleted_at.is_(None),
            visibility_filter(Settlement, user_id),
            Settlement.direction == "we_owe",
            Settlement.status != "settled",
            Settlement.expected_date.is_not(None),
            Settlement.expected_date <= horizon,
        )
    ).all()
    for s in settlements:
        remaining = money(s.total_amount - settlement_paid_total(db, s.id))
        if remaining <= ZERO:
            continue
        items.append(
            {
                "id": s.id,
                "source": "settlement",
                "title": s.person_name,
                "subtitle": "Personal settlement",
                "amount": remaining,
                "due_date": s.expected_date,
                "days_until": (s.expected_date - today).days,
                "is_overdue": s.expected_date < today,
            }
        )

    items.sort(key=lambda i: (i["due_date"] or date.max, -float(i["amount"])))
    return items


def settlement_paid_total(db: Session, settlement_id: uuid.UUID) -> Decimal:
    value = db.scalar(
        select(func.coalesce(func.sum(SettlementPayment.amount), 0)).where(
            SettlementPayment.settlement_id == settlement_id
        )
    )
    return money(value)


def settlement_paid_map(db: Session, settlement_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    if not settlement_ids:
        return {}
    rows = db.execute(
        select(SettlementPayment.settlement_id, func.sum(SettlementPayment.amount))
        .where(SettlementPayment.settlement_id.in_(settlement_ids))
        .group_by(SettlementPayment.settlement_id)
    ).all()
    return {r[0]: money(r[1]) for r in rows}
