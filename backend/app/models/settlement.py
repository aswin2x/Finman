from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDMixin


class Settlement(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Money owed to or by another person, settled in one or more payments."""

    __tablename__ = "settlements"

    person_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(12), nullable=False)  # we_owe | owed_to_us
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    expected_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")  # pending | partial | settled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scope: Mapped[str] = mapped_column(String(10), nullable=False, default="shared")
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)

    payments: Mapped[list["SettlementPayment"]] = relationship(
        back_populates="settlement", cascade="all, delete-orphan", order_by="SettlementPayment.paid_on.desc()"
    )


class SettlementPayment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "settlement_payments"

    settlement_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("settlements.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    recorded_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    settlement: Mapped[Settlement] = relationship(back_populates="payments")
