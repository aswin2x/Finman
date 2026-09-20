from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import DB, CurrentUser
from app.models import Loan, LoanPayment, Transaction
from app.schemas.common import Message
from app.schemas.loan import (
    DebtSummary,
    LoanCreate,
    LoanDetail,
    LoanOut,
    LoanPaymentCreate,
    LoanPaymentOut,
    LoanPaymentUpdate,
    LoanUpdate,
)
from app.services.access import can_edit, visibility_filter
from app.services.finance import (
    ZERO,
    expected_completion,
    loan_progress_pct,
    money,
    months_to_clear,
    next_due_after,
)

router = APIRouter(prefix="/loans", tags=["debts"])


@router.get("", response_model=list[LoanOut])
def list_loans(
    db: DB,
    user: CurrentUser,
    debt_type: str | None = Query(default=None, pattern="^(loan|credit_card|bnpl|personal_due)$"),
    status_filter: str | None = Query(default=None, alias="status", pattern="^(active|paused|closed)$"),
) -> list[Loan]:
    stmt = select(Loan).where(Loan.deleted_at.is_(None), visibility_filter(Loan, user.id))
    if debt_type:
        stmt = stmt.where(Loan.debt_type == debt_type)
    if status_filter:
        stmt = stmt.where(Loan.status == status_filter)
    return list(db.scalars(stmt.order_by(Loan.status, Loan.next_due_date, Loan.name)).all())


@router.get("/summary", response_model=DebtSummary)
def debt_summary(db: DB, user: CurrentUser) -> DebtSummary:
    loans = list(
        db.scalars(select(Loan).where(Loan.deleted_at.is_(None), visibility_filter(Loan, user.id))).all()
    )
    active = [l for l in loans if l.status == "active"]
    by_type: dict[str, dict] = {}
    for loan in active:
        entry = by_type.setdefault(loan.debt_type, {"debt_type": loan.debt_type, "outstanding": ZERO, "emi": ZERO, "count": 0})
        entry["outstanding"] = money(entry["outstanding"] + money(loan.outstanding_balance))
        entry["emi"] = money(entry["emi"] + money(loan.emi_amount))
        entry["count"] += 1

    today = date.today()
    upcoming = sorted(
        [l for l in active if l.next_due_date is not None and l.emi_amount > 0],
        key=lambda l: l.next_due_date,
    )[:5]

    return DebtSummary(
        total_outstanding=money(sum((money(l.outstanding_balance) for l in active), ZERO)),
        monthly_emi_commitment=money(sum((money(l.emi_amount) for l in active), ZERO)),
        active_count=len(active),
        closed_count=len([l for l in loans if l.status == "closed"]),
        by_type=[
            {"debt_type": v["debt_type"], "outstanding": float(v["outstanding"]), "emi": float(v["emi"]), "count": v["count"]}
            for v in by_type.values()
        ],
        next_due=[
            {
                "id": str(l.id),
                "name": l.name,
                "amount": float(money(l.emi_amount)),
                "due_date": l.next_due_date.isoformat(),
                "days_until": (l.next_due_date - today).days,
            }
            for l in upcoming
        ],
    )


@router.get("/{loan_id}", response_model=LoanDetail)
def get_loan(loan_id: uuid.UUID, db: DB, user: CurrentUser) -> LoanDetail:
    loan = _get(db, loan_id, user.id)
    return _detail(db, loan)


@router.post("", response_model=LoanDetail, status_code=status.HTTP_201_CREATED)
def create_loan(payload: LoanCreate, db: DB, user: CurrentUser) -> LoanDetail:
    data = payload.model_dump()
    if data["next_due_date"] is None and data["emi_amount"] and data["emi_amount"] > 0:
        data["next_due_date"] = next_due_after(None, data["due_day"], date.today() - timedelta(days=1))
    loan = Loan(**data, user_id=user.id)
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return _detail(db, loan)


@router.patch("/{loan_id}", response_model=LoanDetail)
def update_loan(loan_id: uuid.UUID, payload: LoanUpdate, db: DB, user: CurrentUser) -> LoanDetail:
    loan = _get(db, loan_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(loan, key, value)
    # A manual balance correction reopens a closed debt, so a balance that
    # comes back is not left out of the outstanding total. An explicit status
    # in the same request wins.
    if "status" not in data:
        _refresh_status(loan)
    db.commit()
    db.refresh(loan)
    return _detail(db, loan)


@router.delete("/{loan_id}", response_model=Message)
def delete_loan(loan_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    loan = _get(db, loan_id, user.id)
    loan.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Debt removed")


@router.get("/{loan_id}/payments", response_model=list[LoanPaymentOut])
def list_payments(loan_id: uuid.UUID, db: DB, user: CurrentUser) -> list[LoanPayment]:
    loan = _get(db, loan_id, user.id)
    return list(loan.payments)


@router.post("/{loan_id}/payments", response_model=LoanDetail, status_code=status.HTTP_201_CREATED)
def record_payment(loan_id: uuid.UUID, payload: LoanPaymentCreate, db: DB, user: CurrentUser) -> LoanDetail:
    """Record an EMI or extra payment.

    The outstanding balance is reduced by the principal component when one is
    supplied, otherwise by the full amount. Interest-only components never
    reduce principal.
    """
    loan = _get(db, loan_id, user.id)
    data = payload.model_dump()
    create_expense = data.pop("create_expense")

    payment = LoanPayment(**data, loan_id=loan.id, paid_by_user_id=user.id)
    db.add(payment)
    db.flush()

    _cap_to_balance(loan, payment)
    _apply_balance(loan, _balance_effect(payment))

    if payment.payment_type == "emi":
        loan.months_paid += 1
        loan.next_due_date = next_due_after(loan.next_due_date, loan.due_day, payment.paid_on)

    _refresh_status(loan)

    # A charge is money already spent and recorded as an expense in its own
    # right; the repayment that follows is what this app books as the expense.
    # Posting one for both would count the same spending twice.
    if create_expense and payment.payment_type != "charge":
        txn = Transaction(
            type="expense",
            amount=money(payment.amount),
            title=f"{loan.name} payment",
            notes=payment.note,
            occurred_on=payment.paid_on,
            payment_method="bank",
            scope=loan.scope,
            category_id=loan.category_id,
            user_id=user.id,
            loan_payment_id=payment.id,
        )
        db.add(txn)
        db.flush()
        payment.transaction_id = txn.id

    db.commit()
    db.refresh(loan)
    return _detail(db, loan)


@router.patch("/{loan_id}/payments/{payment_id}", response_model=LoanDetail)
def update_payment(
    loan_id: uuid.UUID, payment_id: uuid.UUID, payload: LoanPaymentUpdate, db: DB, user: CurrentUser
) -> LoanDetail:
    loan = _get(db, loan_id, user.id)
    payment = db.get(LoanPayment, payment_id)
    if payment is None or payment.loan_id != loan.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    # Reverse what this payment did to the balance, apply the edit, then
    # re-apply it. Adjusting by the amount difference alone would be wrong for
    # a payment split into principal and interest, and backwards for a charge.
    _apply_balance(loan, -_balance_effect(payment))

    data = payload.model_dump(exclude_unset=True)
    was_emi = payment.payment_type == "emi"
    for key, value in data.items():
        if value is not None:
            setattr(payment, key, value)

    # Correcting the instalment does not change how much of it met principal,
    # so the recorded principal is kept and the interest portion absorbs the
    # difference. The balance therefore only moves when principal does.
    if "amount" in data and data["amount"] is not None and payment.principal_component is not None:
        principal = min(money(payment.principal_component), money(payment.amount))
        payment.principal_component = principal
        payment.interest_component = money(money(payment.amount) - principal)
    db.flush()

    _cap_to_balance(loan, payment)
    _apply_balance(loan, _balance_effect(payment))

    is_emi = payment.payment_type == "emi"
    if was_emi and not is_emi and loan.months_paid > 0:
        loan.months_paid -= 1
    elif is_emi and not was_emi:
        loan.months_paid += 1
    _refresh_status(loan)

    if payment.transaction_id:
        txn = db.get(Transaction, payment.transaction_id)
        if txn is not None:
            txn.amount = money(payment.amount)
            txn.occurred_on = payment.paid_on
            txn.notes = payment.note
    db.commit()
    db.refresh(loan)
    return _detail(db, loan)


@router.delete("/{loan_id}/payments/{payment_id}", response_model=LoanDetail)
def delete_payment(loan_id: uuid.UUID, payment_id: uuid.UUID, db: DB, user: CurrentUser) -> LoanDetail:
    loan = _get(db, loan_id, user.id)
    payment = db.get(LoanPayment, payment_id)
    if payment is None or payment.loan_id != loan.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    _apply_balance(loan, -_balance_effect(payment))
    if payment.payment_type == "emi" and loan.months_paid > 0:
        loan.months_paid -= 1
    _refresh_status(loan)

    if payment.transaction_id:
        txn = db.get(Transaction, payment.transaction_id)
        if txn is not None:
            txn.deleted_at = datetime.now(timezone.utc)
    db.delete(payment)
    db.commit()
    db.refresh(loan)
    return _detail(db, loan)


def _balance_effect(payment: LoanPayment) -> Decimal:
    """The signed change a payment makes to the outstanding balance.

    A charge adds to the balance. Any other payment reduces it by its
    principal component when one is recorded, otherwise by the amount less any
    recorded interest, otherwise by the full amount. Interest never reduces
    principal.

    Create adds this, delete subtracts it, and an edit does both, so the three
    paths can never disagree about what a payment was worth.
    """
    amount = money(payment.amount)
    if payment.payment_type == "charge":
        return amount
    if payment.principal_component is not None:
        return -money(payment.principal_component)
    if payment.interest_component is not None:
        return -money(amount - money(payment.interest_component))
    return -amount


def _cap_to_balance(loan: Loan, payment: LoanPayment) -> None:
    """Record how much of a payment actually met principal.

    Paying more than is owed is allowed, since a final instalment often exceeds
    the remaining principal. Only the part that met the balance is recorded as
    principal, so reversing the payment later restores exactly what it cleared
    rather than the whole instalment.
    """
    if payment.payment_type == "charge":
        return
    reduction = -_balance_effect(payment)
    balance = money(loan.outstanding_balance)
    if reduction > balance:
        payment.principal_component = balance
        if payment.interest_component is None:
            payment.interest_component = money(money(payment.amount) - balance)


def _apply_balance(loan: Loan, delta: Decimal) -> None:
    loan.outstanding_balance = money(max(ZERO, money(loan.outstanding_balance) + delta))


def _refresh_status(loan: Loan) -> None:
    """Close a loan once it is cleared, and reopen it if a balance comes back.

    Applies to paused loans too, so a paused debt that is paid off is not left
    in a state the summary counts as neither active nor closed.
    """
    if money(loan.outstanding_balance) <= ZERO:
        if loan.status != "closed":
            loan.status = "closed"
        loan.next_due_date = None
    elif loan.status == "closed":
        loan.status = "active"
        if loan.next_due_date is None and money(loan.emi_amount) > ZERO:
            loan.next_due_date = next_due_after(None, loan.due_day, date.today() - timedelta(days=1))


def _get(db: Session, loan_id: uuid.UUID, user_id: uuid.UUID) -> Loan:
    loan = db.get(Loan, loan_id)
    if loan is None or loan.deleted_at is not None or not can_edit(loan, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")
    return loan


def _detail(db: Session, loan: Loan) -> LoanDetail:
    total_paid = money(
        db.scalar(
            select(func.coalesce(func.sum(LoanPayment.amount), 0)).where(
                LoanPayment.loan_id == loan.id, LoanPayment.payment_type != "charge"
            )
        )
    )
    remaining = months_to_clear(loan.outstanding_balance, loan.emi_amount, loan.interest_rate_annual)
    return LoanDetail(
        **LoanOut.model_validate(loan).model_dump(),
        payments=[LoanPaymentOut.model_validate(p) for p in loan.payments],
        total_paid=total_paid,
        remaining_months_estimate=remaining,
        expected_completion=expected_completion(
            loan.outstanding_balance, loan.emi_amount, loan.interest_rate_annual, loan.next_due_date
        ),
        progress_pct=loan_progress_pct(loan.principal_amount, loan.outstanding_balance),
    )
