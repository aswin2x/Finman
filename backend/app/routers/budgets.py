from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.models import Budget
from app.schemas.budget import BudgetCreate, BudgetOut, BudgetOverview, BudgetProgress, BudgetUpdate
from app.schemas.common import Message
from app.services.access import can_edit, visibility_filter
from app.services.budgets import budget_overview, budget_progress
from app.services.finance import ZERO, money, month_bounds

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetProgress])
def list_budgets(
    db: DB,
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
) -> list[BudgetProgress]:
    start, end = month_bounds(_anchor(month))
    rows = db.scalars(
        select(Budget)
        .where(
            Budget.deleted_at.is_(None),
            visibility_filter(Budget, user.id),
            Budget.period_start <= end,
            Budget.period_end >= start,
        )
        .order_by(Budget.name)
    ).all()
    today = date.today()
    return [BudgetProgress(**budget_progress(db, user.id, b, today)) for b in rows]


@router.get("/overview", response_model=BudgetOverview)
def overview(
    db: DB,
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
) -> BudgetOverview:
    start, end = month_bounds(_anchor(month))
    return BudgetOverview(**budget_overview(db, user.id, start, end, date.today()))


@router.post("", response_model=BudgetProgress, status_code=status.HTTP_201_CREATED)
def create_budget(payload: BudgetCreate, db: DB, user: CurrentUser) -> BudgetProgress:
    data = payload.model_dump()
    if data["category_id"] is not None:
        clash = db.scalar(
            select(Budget).where(
                Budget.deleted_at.is_(None),
                Budget.category_id == data["category_id"],
                Budget.period_start <= data["period_end"],
                Budget.period_end >= data["period_start"],
                visibility_filter(Budget, user.id),
            )
        )
        if clash is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A budget already covers this category for an overlapping period"
            )
    budget = Budget(**data, user_id=user.id)
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return BudgetProgress(**budget_progress(db, user.id, budget, date.today()))


@router.patch("/{budget_id}", response_model=BudgetProgress)
def update_budget(budget_id: uuid.UUID, payload: BudgetUpdate, db: DB, user: CurrentUser) -> BudgetProgress:
    budget = _get(db, budget_id, user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(budget, key, value)
    if budget.period_end < budget.period_start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be on or after period_start")
    db.commit()
    db.refresh(budget)
    return BudgetProgress(**budget_progress(db, user.id, budget, date.today()))


@router.delete("/{budget_id}", response_model=Message)
def delete_budget(budget_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    budget = _get(db, budget_id, user.id)
    budget.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Budget removed")


@router.post("/roll-forward", response_model=list[BudgetOut])
def roll_forward(
    db: DB,
    user: CurrentUser,
    from_month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    to_month: str = Query(pattern=r"^\d{4}-\d{2}$"),
) -> list[Budget]:
    """Copy a month's budgets into a later month.

    Where a source budget has rollover enabled, its unspent amount is carried
    into the new period. Existing budgets for the target month are left alone.
    """
    src_start, src_end = month_bounds(_anchor(from_month))
    dst_start, dst_end = month_bounds(_anchor(to_month))
    if dst_start <= src_start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "to_month must be after from_month")

    sources = db.scalars(
        select(Budget).where(
            Budget.deleted_at.is_(None),
            visibility_filter(Budget, user.id),
            Budget.period_start == src_start,
        )
    ).all()
    existing_categories = {
        b.category_id
        for b in db.scalars(
            select(Budget).where(
                Budget.deleted_at.is_(None),
                visibility_filter(Budget, user.id),
                Budget.period_start == dst_start,
            )
        ).all()
    }

    today = date.today()
    created: list[Budget] = []
    for src in sources:
        if src.category_id in existing_categories:
            continue
        carry = ZERO
        if src.rollover:
            progress = budget_progress(db, user.id, src, today)
            carry = money(max(ZERO, progress["remaining"]))
        budget = Budget(
            name=src.name,
            limit_amount=src.limit_amount,
            period_type=src.period_type,
            period_start=dst_start,
            period_end=dst_end,
            rollover=src.rollover,
            rollover_amount=carry,
            alert_threshold_pct=src.alert_threshold_pct,
            scope=src.scope,
            category_id=src.category_id,
            user_id=user.id,
        )
        db.add(budget)
        created.append(budget)
    db.commit()
    for budget in created:
        db.refresh(budget)
    return created


def _get(db, budget_id: uuid.UUID, user_id: uuid.UUID) -> Budget:
    budget = db.get(Budget, budget_id)
    if budget is None or budget.deleted_at is not None or not can_edit(budget, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
    return budget


def _anchor(month: str | None) -> date:
    if not month:
        return date.today()
    year, mon = month.split("-")
    return date(int(year), int(mon), 1)
