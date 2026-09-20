from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import Direction, Money, ORMModel, PositiveMoney, Scope, SettlementStatus


class SettlementBase(BaseModel):
    person_name: str = Field(min_length=1, max_length=80)
    direction: Direction
    total_amount: PositiveMoney
    expected_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    is_verified: bool = False
    scope: Scope = "shared"


class SettlementCreate(SettlementBase):
    pass


class SettlementUpdate(BaseModel):
    person_name: str | None = Field(default=None, min_length=1, max_length=80)
    direction: Direction | None = None
    total_amount: PositiveMoney | None = None
    expected_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    is_verified: bool | None = None
    scope: Scope | None = None
    status: SettlementStatus | None = None


class SettlementPaymentCreate(BaseModel):
    amount: PositiveMoney
    paid_on: date
    note: str | None = Field(default=None, max_length=200)
    create_expense: bool = True


class SettlementPaymentOut(ORMModel):
    id: uuid.UUID
    settlement_id: uuid.UUID
    amount: Money
    paid_on: date
    note: str | None
    recorded_by_user_id: uuid.UUID
    transaction_id: uuid.UUID | None


class SettlementOut(ORMModel):
    id: uuid.UUID
    person_name: str
    direction: str
    total_amount: Money
    expected_date: date | None
    status: str
    notes: str | None
    is_verified: bool
    scope: str
    user_id: uuid.UUID
    paid_amount: Money = Field(default=Decimal("0"))
    remaining_amount: Money = Field(default=Decimal("0"))


class SettlementDetail(SettlementOut):
    payments: list[SettlementPaymentOut]


class SettlementSummary(BaseModel):
    we_owe_total: Money
    owed_to_us_total: Money
    net_position: Money
    pending_count: int
    settled_count: int
    unverified_count: int
