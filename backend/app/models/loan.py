from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDMixin


class Loan(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Any liability: bank loan, credit card, BNPL or a personal due.

    `outstanding_balance` is the source of truth. It is manually maintained
    and reduced by recorded payments. It is never derived from
    EMI multiplied by remaining tenure.
    """

    __tablename__ = "loans"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    lender: Mapped[str | None] = mapped_column(String(120), nullable=True)
    debt_type: Mapped[str] = mapped_column(String(20), nullable=False, default="loan")  # loan | credit_card | bnpl | personal_due
    principal_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    outstanding_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    emi_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    interest_rate_annual: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    tenure_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    months_paid: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_day: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="active")  # active | paused | closed
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(String(10), nullable=False, default="shared")

    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)

    payments: Mapped[list["LoanPayment"]] = relationship(
        back_populates="loan", cascade="all, delete-orphan", order_by="LoanPayment.paid_on.desc()"
    )


class LoanPayment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "loan_payments"

    loan_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_type: Mapped[str] = mapped_column(String(10), nullable=False, default="emi")  # emi | extra | charge
    principal_component: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    interest_component: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    paid_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    loan: Mapped[Loan] = relationship(back_populates="payments")
