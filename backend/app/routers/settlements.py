from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import DB, CurrentUser
from app.models import Settlement, SettlementPayment, Transaction
from app.schemas.common import Message
from app.schemas.settlement import (
    SettlementCreate,
    SettlementDetail,
    SettlementOut,
    SettlementPaymentCreate,
    SettlementPaymentOut,
    SettlementSummary,
    SettlementUpdate,
)
from app.services.access import can_edit, visibility_filter
from app.services.analytics import settlement_paid_map, settlement_paid_total
from app.services.finance import ZERO, money, settlement_status

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.get("", response_model=list[SettlementOut])
def list_settlements(
    db: DB,
    user: CurrentUser,
    direction: str | None = Query(default=None, pattern="^(we_owe|owed_to_us)$"),
    status_filter: str | None = Query(default=None, alias="status", pattern="^(pending|partial|settled)$"),
    person: str | None = None,
) -> list[SettlementOut]:
    stmt = select(Settlement).where(Settlement.deleted_at.is_(None), visibility_filter(Settlement, user.id))
    if direction:
        stmt = stmt.where(Settlement.direction == direction)
    if status_filter:
        stmt = stmt.where(Settlement.status == status_filter)
    if person:
        stmt = stmt.where(Settlement.person_name.ilike(f"%{person.strip()}%"))
    rows = list(db.scalars(stmt.order_by(Settlement.status, Settlement.expected_date, Settlement.person_name)).all())
    paid = settlement_paid_map(db, [r.id for r in rows])
    return [_with_totals(r, paid.get(r.id, ZERO)) for r in rows]


@router.get("/summary", response_model=SettlementSummary)
def summary(db: DB, user: CurrentUser) -> SettlementSummary:
    rows = list(
        db.scalars(
            select(Settlement).where(Settlement.deleted_at.is_(None), visibility_filter(Settlement, user.id))
        ).all()
    )
    paid = settlement_paid_map(db, [r.id for r in rows])
    we_owe = ZERO
    owed = ZERO
    for row in rows:
        remaining = money(max(ZERO, money(row.total_amount) - paid.get(row.id, ZERO)))
        if row.direction == "we_owe":
            we_owe = money(we_owe + remaining)
        else:
            owed = money(owed + remaining)
    return SettlementSummary(
        we_owe_total=we_owe,
        owed_to_us_total=owed,
        net_position=money(owed - we_owe),
        pending_count=len([r for r in rows if r.status != "settled"]),
        settled_count=len([r for r in rows if r.status == "settled"]),
        unverified_count=len([r for r in rows if not r.is_verified]),
    )


@router.get("/{settlement_id}", response_model=SettlementDetail)
def get_settlement(settlement_id: uuid.UUID, db: DB, user: CurrentUser) -> SettlementDetail:
    row = _get(db, settlement_id, user.id)
    return _detail(db, row)


@router.post("", response_model=SettlementDetail, status_code=status.HTTP_201_CREATED)
def create_settlement(payload: SettlementCreate, db: DB, user: CurrentUser) -> SettlementDetail:
    row = Settlement(**payload.model_dump(), user_id=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _detail(db, row)


@router.patch("/{settlement_id}", response_model=SettlementDetail)
def update_settlement(
    settlement_id: uuid.UUID, payload: SettlementUpdate, db: DB, user: CurrentUser
) -> SettlementDetail:
    row = _get(db, settlement_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    manual_status = data.pop("status", None)

    paid = settlement_paid_total(db, row.id)
    if data.get("total_amount") is not None and money(data["total_amount"]) < paid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{money(paid)} has already been recorded against this settlement. "
            "Remove a payment before lowering the total below it.",
        )

    for key, value in data.items():
        setattr(row, key, value)
    row.status = manual_status or settlement_status(row.total_amount, paid)
    db.commit()
    db.refresh(row)
    return _detail(db, row)


@router.delete("/{settlement_id}", response_model=Message)
def delete_settlement(settlement_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    row = _get(db, settlement_id, user.id)
    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Settlement removed")


@router.post("/{settlement_id}/payments", response_model=SettlementDetail, status_code=status.HTTP_201_CREATED)
def record_payment(
    settlement_id: uuid.UUID, payload: SettlementPaymentCreate, db: DB, user: CurrentUser
) -> SettlementDetail:
    row = _get(db, settlement_id, user.id)
    data = payload.model_dump()
    create_expense = data.pop("create_expense")

    already_paid = settlement_paid_total(db, row.id)
    if money(already_paid + money(data["amount"])) > money(row.total_amount):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"That exceeds the outstanding amount of {money(row.total_amount - already_paid)}",
        )

    payment = SettlementPayment(**data, settlement_id=row.id, recorded_by_user_id=user.id)
    db.add(payment)
    db.flush()

    if create_expense:
        is_outflow = row.direction == "we_owe"
        txn = Transaction(
            type="expense" if is_outflow else "income",
            amount=money(payment.amount),
            title=f"{'Paid' if is_outflow else 'Received from'} {row.person_name}",
            notes=payment.note,
            occurred_on=payment.paid_on,
            payment_method="upi",
            scope=row.scope,
            user_id=user.id,
            settlement_payment_id=payment.id,
        )
        db.add(txn)
        db.flush()
        payment.transaction_id = txn.id

    row.status = settlement_status(row.total_amount, money(already_paid + money(payment.amount)))
    db.commit()
    db.refresh(row)
    return _detail(db, row)


@router.delete("/{settlement_id}/payments/{payment_id}", response_model=SettlementDetail)
def delete_payment(
    settlement_id: uuid.UUID, payment_id: uuid.UUID, db: DB, user: CurrentUser
) -> SettlementDetail:
    row = _get(db, settlement_id, user.id)
    payment = db.get(SettlementPayment, payment_id)
    if payment is None or payment.settlement_id != row.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    # Removed outright with the payment, so no orphaned entry can be restored.
    if payment.transaction_id:
        txn = db.get(Transaction, payment.transaction_id)
        if txn is not None:
            db.delete(txn)
    db.delete(payment)
    db.flush()
    row.status = settlement_status(row.total_amount, settlement_paid_total(db, row.id))
    db.commit()
    db.refresh(row)
    return _detail(db, row)


def _get(db: Session, settlement_id: uuid.UUID, user_id: uuid.UUID) -> Settlement:
    row = db.get(Settlement, settlement_id)
    if row is None or row.deleted_at is not None or not can_edit(row, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Settlement not found")
    return row


def _with_totals(row: Settlement, paid) -> SettlementOut:
    out = SettlementOut.model_validate(row)
    out.paid_amount = money(paid)
    out.remaining_amount = money(max(ZERO, money(row.total_amount) - money(paid)))
    return out


def _detail(db: Session, row: Settlement) -> SettlementDetail:
    paid = settlement_paid_total(db, row.id)
    base = _with_totals(row, paid)
    return SettlementDetail(
        **base.model_dump(),
        payments=[SettlementPaymentOut.model_validate(p) for p in row.payments],
    )
