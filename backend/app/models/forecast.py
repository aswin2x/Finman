from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDMixin


class ForecastScenario(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """A saved set of what-if adjustments used by the forecasting engine."""

    __tablename__ = "forecast_scenarios"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    horizon_months: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    adjustments: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
