from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["expense", "income"] = "expense"
    icon: str = Field(default="tag", max_length=40)
    color: str = Field(default="#8A8F98", pattern=r"^#[0-9a-fA-F]{6}$")
    sort_order: int = 0
    is_personal: bool = False


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sort_order: int | None = None


class CategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    kind: str
    icon: str
    color: str
    sort_order: int
    is_system: bool
    owner_id: uuid.UUID | None
