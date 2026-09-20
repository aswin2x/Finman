from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import DB, CurrentUser
from app.models import Category, Transaction, User
from app.schemas.common import Message, Page
from app.schemas.transaction import (
    MonthlySummary,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
)
from app.services import porting
from app.services.access import can_edit, category_visibility_filter, visibility_filter
from app.services.analytics import (
    category_breakdown,
    payment_method_breakdown,
    totals_between,
    user_breakdown,
)
from app.services.finance import money, month_bounds

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _base_query(user_id: uuid.UUID, include_deleted: bool = False):
    stmt = select(Transaction).where(visibility_filter(Transaction, user_id))
    if not include_deleted:
        stmt = stmt.where(Transaction.deleted_at.is_(None))
    return stmt


def _apply_filters(
    stmt,
    *,
    type_: str | None,
    category_ids: list[uuid.UUID] | None,
    user_ids: list[uuid.UUID] | None,
    payment_methods: list[str] | None,
    date_from: date | None,
    date_to: date | None,
    min_amount: float | None,
    max_amount: float | None,
    search: str | None,
    scope: str | None,
):
    if type_:
        stmt = stmt.where(Transaction.type == type_)
    if category_ids:
        stmt = stmt.where(Transaction.category_id.in_(category_ids))
    if user_ids:
        stmt = stmt.where(Transaction.user_id.in_(user_ids))
    if payment_methods:
        stmt = stmt.where(Transaction.payment_method.in_(payment_methods))
    if date_from:
        stmt = stmt.where(Transaction.occurred_on >= date_from)
    if date_to:
        stmt = stmt.where(Transaction.occurred_on <= date_to)
    if min_amount is not None:
        stmt = stmt.where(Transaction.amount >= min_amount)
    if max_amount is not None:
        stmt = stmt.where(Transaction.amount <= max_amount)
    if scope:
        stmt = stmt.where(Transaction.scope == scope)
    if search:
        needle = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Transaction.title).like(needle),
                func.lower(func.coalesce(Transaction.notes, "")).like(needle),
            )
        )
    return stmt


@router.get("", response_model=Page[TransactionOut])
def list_transactions(
    db: DB,
    user: CurrentUser,
    type: str | None = Query(default=None, pattern="^(expense|income)$"),
    category_id: list[uuid.UUID] | None = Query(default=None),
    user_id: list[uuid.UUID] | None = Query(default=None),
    payment_method: list[str] | None = Query(default=None),
    date_from: date | None = None,
    date_to: date | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    search: str | None = None,
    scope: str | None = Query(default=None, pattern="^(shared|personal)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[TransactionOut]:
    stmt = _apply_filters(
        _base_query(user.id),
        type_=type,
        category_ids=category_id,
        user_ids=user_id,
        payment_methods=payment_method,
        date_from=date_from,
        date_to=date_to,
        min_amount=min_amount,
        max_amount=max_amount,
        search=search,
        scope=scope,
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Transaction.occurred_on.desc(), Transaction.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return Page[TransactionOut](
        items=[TransactionOut.model_validate(i) for i in items], total=int(total), limit=limit, offset=offset
    )


@router.get("/summary", response_model=MonthlySummary)
def monthly_summary(
    db: DB,
    user: CurrentUser,
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM, defaults to today"),
) -> MonthlySummary:
    anchor = _month_anchor(month)
    start, end = month_bounds(anchor)
    income, expenses = totals_between(db, user.id, start, end)
    counts = db.execute(
        select(Transaction.type, func.count(Transaction.id)).where(
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user.id),
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        ).group_by(Transaction.type)
    ).all()
    count_map = {r[0]: int(r[1]) for r in counts}
    return MonthlySummary(
        month=start.strftime("%Y-%m"),
        income=income,
        expenses=expenses,
        net=money(income - expenses),
        expense_count=count_map.get("expense", 0),
        income_count=count_map.get("income", 0),
        by_category=category_breakdown(db, user.id, start, end),
        by_user=user_breakdown(db, user.id, start, end),
        by_payment_method=payment_method_breakdown(db, user.id, start, end),
    )


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: uuid.UUID, db: DB, user: CurrentUser) -> Transaction:
    return _get(db, transaction_id, user.id)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: TransactionCreate, db: DB, user: CurrentUser) -> Transaction:
    data = payload.model_dump()
    owner_id = data.pop("user_id") or user.id
    _validate_owner(db, owner_id)
    _validate_category(db, data.get("category_id"), data["type"], user.id)
    txn = Transaction(**data, user_id=owner_id)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: uuid.UUID, payload: TransactionUpdate, db: DB, user: CurrentUser
) -> Transaction:
    txn = _get(db, transaction_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    if "user_id" in data and data["user_id"]:
        _validate_owner(db, data["user_id"])
    if "category_id" in data:
        _validate_category(db, data["category_id"], data.get("type", txn.type), user.id)
    for key, value in data.items():
        setattr(txn, key, value)
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/{transaction_id}", response_model=Message)
def delete_transaction(transaction_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    txn = _get(db, transaction_id, user.id)
    if txn.loan_payment_id or txn.settlement_payment_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This entry belongs to a recorded payment. Delete the payment instead so balances stay correct.",
        )
    txn.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Deleted")


@router.post("/{transaction_id}/restore", response_model=TransactionOut)
def restore_transaction(transaction_id: uuid.UUID, db: DB, user: CurrentUser) -> Transaction:
    """Supports the undo affordance in the client."""
    txn = db.get(Transaction, transaction_id)
    if txn is None or not can_edit(txn, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")

    txn.deleted_at = None
    db.commit()
    db.refresh(txn)
    return txn


@router.post("/import/preview")
async def import_preview(db: DB, user: CurrentUser, file: UploadFile) -> dict:
    rows = await _read_rows(file)
    valid, errors = porting.preview_rows(rows)
    return {
        "total_rows": len(rows),
        "valid_count": len(valid),
        "error_count": len(errors),
        "sample": [
            {**r, "occurred_on": r["occurred_on"].isoformat(), "amount": float(r["amount"])} for r in valid[:20]
        ],
        "errors": errors[:50],
    }


@router.post("/import")
async def import_commit(db: DB, user: CurrentUser, file: UploadFile) -> dict:
    rows = await _read_rows(file)
    valid, errors = porting.preview_rows(rows)
    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No valid rows found in the file")
    count, batch_id = porting.commit_rows(db, valid, user.id)
    return {"imported": count, "skipped": len(errors), "batch_id": batch_id, "errors": errors[:50]}


@router.delete("/import/{batch_id}", response_model=Message)
def undo_import(batch_id: str, db: DB, user: CurrentUser) -> Message:
    # Scoped like every other list query, so an import cannot be used to reach
    # records the caller is not allowed to see.
    rows = db.scalars(
        select(Transaction).where(
            Transaction.import_batch_id == batch_id,
            Transaction.deleted_at.is_(None),
            visibility_filter(Transaction, user.id),
        )
    ).all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.deleted_at = now
    db.commit()
    return Message(detail=f"Removed {len(rows)} imported entries")


@router.get("/export/file")
def export_file(
    db: DB,
    user: CurrentUser,
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    type: str | None = Query(default=None, pattern="^(expense|income)$"),
) -> Response:
    stmt = _apply_filters(
        _base_query(user.id),
        type_=type,
        category_ids=None,
        user_ids=None,
        payment_methods=None,
        date_from=date_from,
        date_to=date_to,
        min_amount=None,
        max_amount=None,
        search=None,
        scope=None,
    ).order_by(Transaction.occurred_on.desc())
    rows = list(db.scalars(stmt).all())
    stamp = date.today().isoformat()
    if format == "xlsx":
        return Response(
            content=porting.export_xlsx(rows),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="finman-{stamp}.xlsx"'},
        )
    return Response(
        content=porting.export_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="finman-{stamp}.csv"'},
    )


@router.get("/export/template")
def export_template() -> Response:
    return Response(
        content=porting.template_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="finman-import-template.csv"'},
    )


async def _read_rows(file: UploadFile) -> list[dict]:
    content = await file.read()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
    name = (file.filename or "").lower()
    try:
        if name.endswith((".xlsx", ".xlsm")):
            return porting.rows_from_xlsx(content)
        return porting.rows_from_csv(content)
    except porting.ImportError_ as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


def _month_anchor(month: str | None) -> date:
    if not month:
        return date.today()
    year, mon = month.split("-")
    return date(int(year), int(mon), 1)


def _get(db: Session, transaction_id: uuid.UUID, user_id: uuid.UUID) -> Transaction:
    txn = db.get(Transaction, transaction_id)
    if txn is None or txn.deleted_at is not None or not can_edit(txn, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return txn


def _validate_owner(db: Session, owner_id: uuid.UUID) -> None:
    if db.get(User, owner_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown household member")


def _validate_category(db: Session, category_id: uuid.UUID | None, txn_type: str, user_id: uuid.UUID) -> None:
    if category_id is None:
        return
    category = db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category")
    if category.owner_id is not None and category.owner_id != user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That category belongs to another member")
    if category.kind != txn_type:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Category {category.name!r} cannot be used for {txn_type} entries"
        )
