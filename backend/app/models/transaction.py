from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDMixin


class Transaction(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """A single expense or income entry.

    Loan EMI payments and settlement payments create linked expense
    transactions so cash flow always reflects money that actually moved.
    """

    __tablename__ = "transactions"

    type: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # expense | income
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="upi")
    scope: Mapped[str] = mapped_column(String(10), nullable=False, default="shared", index=True)  # shared | personal

    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    recurring_rule_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("recurring_rules.id", ondelete="SET NULL"), nullable=True)
    loan_payment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("loan_payments.id", ondelete="SET NULL"), nullable=True)
    settlement_payment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("settlement_payments.id", ondelete="SET NULL"), nullable=True)

    is_imported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    import_batch_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)

    category = relationship("Category", lazy="joined")
    user = relationship("User", lazy="joined")
