from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser
from app.models import Category, Transaction
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate
from app.schemas.common import Message
from app.services.access import category_visibility_filter

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: DB, user: CurrentUser, kind: str | None = Query(default=None)) -> list[Category]:
    stmt = select(Category).where(
        Category.deleted_at.is_(None),
        category_visibility_filter(Category, user.id),
    )
    if kind:
        stmt = stmt.where(Category.kind == kind)
    return list(db.scalars(stmt.order_by(Category.sort_order, Category.name)).all())


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: DB, user: CurrentUser) -> Category:
    data = payload.model_dump()
    is_personal = data.pop("is_personal")
    existing = db.scalar(
        select(Category).where(
            Category.deleted_at.is_(None),
            func.lower(Category.name) == data["name"].strip().lower(),
            Category.kind == data["kind"],
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {data['kind']} category named {data['name']!r} already exists")
    category = Category(**data, owner_id=user.id if is_personal else None)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: uuid.UUID, payload: CategoryUpdate, db: DB, user: CurrentUser) -> Category:
    category = _get(db, category_id, user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", response_model=Message)
def delete_category(category_id: uuid.UUID, db: DB, user: CurrentUser) -> Message:
    category = _get(db, category_id, user.id)
    if category.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System categories cannot be deleted")
    in_use = db.scalar(
        select(func.count(Transaction.id)).where(
            Transaction.category_id == category_id, Transaction.deleted_at.is_(None)
        )
    )
    category.deleted_at = datetime.now(timezone.utc)
    db.commit()
    if in_use:
        # The existing entries keep the category so past months still read
        # correctly; it simply stops being offered for new ones.
        return Message(
            detail=f"Category removed. {in_use} existing entries keep it, and it is no longer offered for new ones."
        )
    return Message(detail="Category removed")


def _get(db, category_id: uuid.UUID, user_id: uuid.UUID) -> Category:
    category = db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    if category.owner_id is not None and category.owner_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This is another member's personal category")
    return category
