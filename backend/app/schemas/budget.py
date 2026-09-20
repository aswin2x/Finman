from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.category import CategoryOut
from app.schemas.common import Money, NonNegativeMoney, ORMModel, PositiveMoney, Scope


class BudgetBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    limit_amount: PositiveMoney
    period_type: Literal["monthly", "custom"] = "monthly"
    period_start: date
    period_end: date
    rollover: bool = False
    rollover_amount: NonNegativeMoney = Field(default=Decimal("0"))
    alert_threshold_pct: int = Field(default=80, ge=1, le=100)
    scope: Scope = "shared"
    category_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _check_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    limit_amount: PositiveMoney | None = None
    period_start: date | None = None
    period_end: date | None = None
    rollover: bool | None = None
    rollover_amount: NonNegativeMoney | None = None
    alert_threshold_pct: int | None = Field(default=None, ge=1, le=100)
    scope: Scope | None = None
    category_id: uuid.UUID | None = None


class BudgetOut(ORMModel):
    id: uuid.UUID
    name: str
    limit_amount: Money
    period_type: str
    period_start: date
    period_end: date
    rollover: bool
    rollover_amount: Money
    alert_threshold_pct: int
    scope: str
    category_id: uuid.UUID | None
    category: CategoryOut | None
    user_id: uuid.UUID


class BudgetProgress(BaseModel):
    """A budget plus the spend computed for its period."""

    budget: BudgetOut
    effective_limit: Money
    spent: Money
    remaining: Money
    used_pct: float
    state: Literal["on_track", "warning", "over"]
    days_remaining: int
    daily_allowance: Money


class BudgetOverview(BaseModel):
    period_start: date
    period_end: date
    total_limit: Money
    total_spent: Money
    total_remaining: Money
    used_pct: float
    state: Literal["on_track", "warning", "over"]
    categories: list[BudgetProgress]
    uncategorised_spend: Money
    unbudgeted_spend: Money
