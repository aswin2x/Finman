from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.models import RecurringRule, Transaction
from app.schemas.common import Message
from app.schemas.recurring import RecurringCreate, RecurringOut, RecurringUpdate
from app.schemas.transaction import TransactionOut
from app.services.access import can_edit, visibility_filter
from app.services.finance import advance_recurring, safe_day

router = APIRouter(prefix="/recurring", tags=["recurring"])


@router.get("", response_model=list[RecurringOut])
def list_rules(db: DB, user: CurrentUser, active_only: bool = True) -> list[RecurringRule]:
    stmt = select(RecurringRule).where(
        RecurringRule.deleted_at.is_(None), visibility_filter(RecurringRule, user.id)
    )
    if active_only:
        stmt = stmt.where(RecurringRule.is_active.is_(True))
    return list(db.scalars(stmt.order_by(RecurringRule.next_run_on)).all())


@router.post("", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
def create_rule(payload: RecurringCreate, db: DB, user: CurrentUser) -> RecurringRule:
    data = payload.model_dump()
    owner_id = data.pop("user_id") or user.id
    next_run = _first_run(data["start_date"], data["day_of_month"], data["frequency"])
    rule = RecurringRule(**data, user_id=owner_id, next_run_on=next_run)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/{rule_id}", response_model=RecurringOut)
def update_rule(rule_id: uuid.UUID, payload: RecurringUpdate, db: DB, user: CurrentUser) -> RecurringRule:
    rule = _get(db, rule_id, user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key in {"end_date", "category_id"}:
            setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", response_model=Message)
def delete_rule(rule_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    rule = _get(db, rule_id, user.id)
    rule.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Recurring entry removed")


@router.post("/{rule_id}/post", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def post_now(rule_id: uuid.UUID, db: DB, user: CurrentUser, on: date | None = None) -> Transaction:
    """Turn a due recurring rule into a real transaction and advance its schedule."""
    rule = _get(db, rule_id, user.id)
    occurred = on or rule.next_run_on
    txn = Transaction(
        type=rule.type,
        amount=rule.amount,
        title=rule.title,
        occurred_on=occurred,
        payment_method=rule.payment_method,
        scope=rule.scope,
        category_id=rule.category_id,
        user_id=rule.user_id,
        recurring_rule_id=rule.id,
    )
    db.add(txn)
    rule.next_run_on = advance_recurring(rule.next_run_on, rule.frequency, rule.day_of_month)
    if rule.end_date and rule.next_run_on > rule.end_date:
        rule.is_active = False
    db.commit()
    db.refresh(txn)
    return txn


@router.post("/post-due", response_model=list[TransactionOut])
def post_all_due(db: DB, user: CurrentUser, through: date | None = None) -> list[Transaction]:
    """Post every auto-post rule that has come due. Idempotent by design.

    A rule only advances once its transaction is written, so calling this twice
    on the same day cannot double-post.
    """
    cutoff = through or date.today()
    rules = db.scalars(
        select(RecurringRule).where(
            RecurringRule.deleted_at.is_(None),
            visibility_filter(RecurringRule, user.id),
            RecurringRule.is_active.is_(True),
            RecurringRule.auto_post.is_(True),
            RecurringRule.next_run_on <= cutoff,
        )
    ).all()

    created: list[Transaction] = []
    for rule in rules:
        guard = 0
        while rule.next_run_on <= cutoff and rule.is_active and guard < 60:
            txn = Transaction(
                type=rule.type,
                amount=rule.amount,
                title=rule.title,
                occurred_on=rule.next_run_on,
                payment_method=rule.payment_method,
                scope=rule.scope,
                category_id=rule.category_id,
                user_id=rule.user_id,
                recurring_rule_id=rule.id,
            )
            db.add(txn)
            created.append(txn)
            rule.next_run_on = advance_recurring(rule.next_run_on, rule.frequency, rule.day_of_month)
            if rule.end_date and rule.next_run_on > rule.end_date:
                rule.is_active = False
            guard += 1
    db.commit()
    for txn in created:
        db.refresh(txn)
    return created


def _get(db, rule_id: uuid.UUID, user_id: uuid.UUID) -> RecurringRule:
    rule = db.get(RecurringRule, rule_id)
    if rule is None or rule.deleted_at is not None or not can_edit(rule, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recurring entry not found")
    return rule


def _first_run(start: date, day_of_month: int, frequency: str) -> date:
    if frequency == "weekly":
        return start
    candidate = safe_day(start.year, start.month, day_of_month)
    if candidate < start:
        return advance_recurring(candidate, frequency, day_of_month)
    return candidate
