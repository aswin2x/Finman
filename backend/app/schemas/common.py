from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# Amounts are stored as Decimal for accuracy and serialised as JSON numbers
# (rounded to 2 dp) so the mobile client can consume them directly.
Money = Annotated[Decimal, PlainSerializer(lambda v: float(round(v, 2)), return_type=float, when_used="json")]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
NonNegativeMoney = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]

Scope = Literal["shared", "personal"]
TxnType = Literal["expense", "income"]
PaymentMethod = Literal["upi", "cash", "card", "bank", "wallet", "other"]
DebtType = Literal["loan", "credit_card", "bnpl", "personal_due"]
LoanStatus = Literal["active", "paused", "closed"]
Direction = Literal["we_owe", "owed_to_us"]
SettlementStatus = Literal["pending", "partial", "settled"]
Frequency = Literal["weekly", "monthly", "yearly"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int
