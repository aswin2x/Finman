from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.category import CategoryOut
from app.schemas.common import Money, ORMModel, PaymentMethod, PositiveMoney, Scope, TxnType


class TransactionBase(BaseModel):
    type: TxnType
    amount: PositiveMoney
    title: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    occurred_on: date
    payment_method: PaymentMethod = "upi"
    scope: Scope = "shared"
    category_id: uuid.UUID | None = None


class TransactionCreate(TransactionBase):
    # Defaults to the caller. Either user may record on behalf of the other.
    user_id: uuid.UUID | None = None
    recurring_rule_id: uuid.UUID | None = None


class TransactionUpdate(BaseModel):
    type: TxnType | None = None
    amount: PositiveMoney | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    occurred_on: date | None = None
    payment_method: PaymentMethod | None = None
    scope: Scope | None = None
    category_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None


class UserBrief(ORMModel):
    id: uuid.UUID
    display_name: str
    avatar_color: str


class TransactionOut(ORMModel):
    id: uuid.UUID
    type: str
    amount: Money
    title: str
    notes: str | None
    occurred_on: date
    payment_method: str
    scope: str
    category_id: uuid.UUID | None
    category: CategoryOut | None
    user_id: uuid.UUID
    user: UserBrief
    recurring_rule_id: uuid.UUID | None
    loan_payment_id: uuid.UUID | None
    settlement_payment_id: uuid.UUID | None
    is_imported: bool
    import_batch_id: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class CategoryTotal(BaseModel):
    category_id: uuid.UUID | None
    name: str
    color: str
    icon: str
    amount: Money
    count: int
    share_pct: float


class MonthlySummary(BaseModel):
    month: str
    income: Money
    expenses: Money
    net: Money
    expense_count: int
    income_count: int
    by_category: list[CategoryTotal]
    by_user: list[dict]
    by_payment_method: list[dict]
