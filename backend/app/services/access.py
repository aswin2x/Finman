"""Shared vs personal record visibility.

Both users always see `shared` records. A `personal` record is visible only
to the user who owns it. Every list query in the API funnels through these
helpers so the rule cannot drift between endpoints.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, or_


def visibility_filter(model: Any, user_id: uuid.UUID) -> ColumnElement[bool]:
    return or_(model.scope == "shared", model.user_id == user_id)


def can_view(record: Any, user_id: uuid.UUID) -> bool:
    return record.scope == "shared" or record.user_id == user_id


def can_edit(record: Any, user_id: uuid.UUID) -> bool:
    """Both users may edit shared household records; personal ones stay private."""
    return can_view(record, user_id)


def category_visibility_filter(model: Any, user_id: uuid.UUID) -> ColumnElement[bool]:
    return or_(model.owner_id.is_(None), model.owner_id == user_id)
