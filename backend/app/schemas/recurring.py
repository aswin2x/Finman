from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.schemas.category import CategoryOut
from app.schemas.common import Frequency, Money, ORMModel, PaymentMethod, PositiveMoney, Scope, TxnType


class RecurringBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    type: TxnType
    amount: PositiveMoney
    frequency: Frequency = "monthly"
    day_of_month: int = Field(default=1, ge=1, le=31)
    start_date: date
    end_date: date | None = None
    is_active: bool = True
    auto_post: bool = False
    payment_method: PaymentMethod = "bank"
    scope: Scope = "shared"
    category_id: uuid.UUID | None = None


class RecurringCreate(RecurringBase):
    user_id: uuid.UUID | None = None


class RecurringUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    type: TxnType | None = None
    amount: PositiveMoney | None = None
    frequency: Frequency | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    auto_post: bool | None = None
    payment_method: PaymentMethod | None = None
    scope: Scope | None = None
    category_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    next_run_on: date | None = None


class RecurringOut(ORMModel):
    id: uuid.UUID
    title: str
    type: str
    amount: Money
    frequency: str
    day_of_month: int
    start_date: date
    end_date: date | None
    next_run_on: date
    is_active: bool
    auto_post: bool
    payment_method: str
    scope: str
    category_id: uuid.UUID | None
    category: CategoryOut | None
    user_id: uuid.UUID
