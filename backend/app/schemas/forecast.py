from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Money, NonNegativeMoney, ORMModel


class ForecastAdjustment(BaseModel):
    """A single what-if change applied from a given month onwards."""

    kind: Literal["income_delta", "expense_delta", "one_off", "new_recurring"]
    label: str = Field(min_length=1, max_length=80)
    amount: float
    starts_on: date | None = None
    ends_on: date | None = None


class ForecastRequest(BaseModel):
    horizon_months: Literal[1, 3, 6, 12] = 6
    adjustments: list[ForecastAdjustment] = Field(default_factory=list)
    # Overrides the baseline derived from recurring rules and history.
    monthly_income_override: NonNegativeMoney | None = None
    monthly_expense_override: NonNegativeMoney | None = None


class ForecastMonth(BaseModel):
    month: str
    month_start: date
    projected_income: Money
    projected_expenses: Money
    projected_emi: Money
    projected_savings: Money
    projected_closing_balance: Money
    loans_closing_this_month: list[str]
    is_estimate: bool = True


class ForecastResponse(BaseModel):
    """All values except `actual_balance` are estimates, never live balances."""

    generated_on: date
    horizon_months: int
    actual_balance: Money
    budgeted_monthly_expense: Money
    baseline_monthly_income: Money
    baseline_monthly_expense: Money
    baseline_monthly_emi: Money
    months: list[ForecastMonth]
    projected_end_balance: Money
    total_projected_savings: Money
    debt_free_month: str | None
    disclaimer: str = (
        "Projections are estimates based on recorded history, recurring rules and "
        "active commitments. They are not a live bank balance."
    )


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    horizon_months: Literal[1, 3, 6, 12] = 6
    adjustments: list[ForecastAdjustment] = Field(default_factory=list)


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    horizon_months: Literal[1, 3, 6, 12] | None = None
    adjustments: list[ForecastAdjustment] | None = None


class ScenarioOut(ORMModel):
    id: uuid.UUID
    name: str
    horizon_months: int
    adjustments: dict
    user_id: uuid.UUID


class ScenarioComparison(BaseModel):
    base: ForecastResponse
    scenario: ForecastResponse
    end_balance_delta: Money
    savings_delta: Money
