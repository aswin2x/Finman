from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import (
    DebtType,
    LoanStatus,
    Money,
    NonNegativeMoney,
    ORMModel,
    PositiveMoney,
    Scope,
)


class LoanBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lender: str | None = Field(default=None, max_length=120)
    debt_type: DebtType = "loan"
    principal_amount: NonNegativeMoney
    outstanding_balance: NonNegativeMoney
    emi_amount: NonNegativeMoney = Field(default=Decimal("0"))
    interest_rate_annual: float | None = Field(default=None, ge=0, le=100)
    tenure_months: int | None = Field(default=None, ge=0, le=600)
    months_paid: int = Field(default=0, ge=0, le=600)
    start_date: date | None = None
    due_day: int = Field(default=5, ge=1, le=31)
    next_due_date: date | None = None
    status: LoanStatus = "active"
    notes: str | None = Field(default=None, max_length=2000)
    scope: Scope = "shared"
    category_id: uuid.UUID | None = None


class LoanCreate(LoanBase):
    pass


class LoanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    lender: str | None = Field(default=None, max_length=120)
    debt_type: DebtType | None = None
    principal_amount: NonNegativeMoney | None = None
    outstanding_balance: NonNegativeMoney | None = None
    emi_amount: NonNegativeMoney | None = None
    interest_rate_annual: float | None = Field(default=None, ge=0, le=100)
    tenure_months: int | None = Field(default=None, ge=0, le=600)
    months_paid: int | None = Field(default=None, ge=0, le=600)
    start_date: date | None = None
    due_day: int | None = Field(default=None, ge=1, le=31)
    next_due_date: date | None = None
    status: LoanStatus | None = None
    notes: str | None = Field(default=None, max_length=2000)
    scope: Scope | None = None
    category_id: uuid.UUID | None = None


class LoanPaymentCreate(BaseModel):
    amount: PositiveMoney
    paid_on: date
    payment_type: Literal["emi", "extra", "charge"] = "emi"
    principal_component: NonNegativeMoney | None = None
    interest_component: NonNegativeMoney | None = None
    note: str | None = Field(default=None, max_length=200)
    # When true the payment also posts an expense so cash flow reflects it.
    create_expense: bool = True


class LoanPaymentUpdate(BaseModel):
    amount: PositiveMoney | None = None
    paid_on: date | None = None
    payment_type: Literal["emi", "extra", "charge"] | None = None
    note: str | None = Field(default=None, max_length=200)


class LoanPaymentOut(ORMModel):
    id: uuid.UUID
    loan_id: uuid.UUID
    amount: Money
    paid_on: date
    payment_type: str
    principal_component: Money | None
    interest_component: Money | None
    note: str | None
    paid_by_user_id: uuid.UUID
    transaction_id: uuid.UUID | None


class LoanOut(ORMModel):
    id: uuid.UUID
    name: str
    lender: str | None
    debt_type: str
    principal_amount: Money
    outstanding_balance: Money
    emi_amount: Money
    interest_rate_annual: float | None
    tenure_months: int | None
    months_paid: int
    start_date: date | None
    due_day: int
    next_due_date: date | None
    status: str
    notes: str | None
    scope: str
    category_id: uuid.UUID | None
    user_id: uuid.UUID


class LoanDetail(LoanOut):
    payments: list[LoanPaymentOut]
    total_paid: Money
    remaining_months_estimate: int | None
    expected_completion: date | None
    progress_pct: float


class DebtSummary(BaseModel):
    total_outstanding: Money
    monthly_emi_commitment: Money
    active_count: int
    closed_count: int
    by_type: list[dict]
    next_due: list[dict]
