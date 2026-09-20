from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDMixin


class Budget(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "budgets"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    period_type: Mapped[str] = mapped_column(String(10), nullable=False, default="monthly")  # monthly | custom
    period_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    rollover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rollover_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    alert_threshold_pct: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    scope: Mapped[str] = mapped_column(String(10), nullable=False, default="shared")

    # NULL category means an overall budget for the period.
    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)

    category = relationship("Category", lazy="joined")
