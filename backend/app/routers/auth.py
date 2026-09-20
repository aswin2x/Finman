from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import DB, CurrentUser
from app.core.security import create_token_pair, decode_token, hash_password, verify_password
from app.models import User, UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from app.schemas.common import Message

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(db, user: User, device_name: str | None) -> TokenResponse:
    settings = get_settings()
    access, refresh, sid = create_token_pair(str(user.id))
    db.add(UserSession(id=sid, user_id=user.id, device_name=device_name))
    db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DB) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == payload.username.strip().lower()))
    # Always run a hash comparison so a missing user and a wrong password
    # take a similar amount of time.
    password_hash = user.password_hash if user else hash_password("invalid-placeholder")
    if not verify_password(payload.password, password_hash) or user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    return _issue(db, user, payload.device_name)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: DB) -> TokenResponse:
    try:
        claims = decode_token(payload.refresh_token, "refresh")
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc

    session = db.get(UserSession, claims.get("sid"))
    if session is None or session.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked")

    user = db.get(User, uuid.UUID(str(claims["sub"])))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Rotate: the old session is retired and a new one issued.
    session.revoked_at = datetime.now(timezone.utc)
    return _issue(db, user, session.device_name)


@router.post("/logout", response_model=Message)
def logout(payload: RefreshRequest, db: DB, user: CurrentUser) -> Message:
    try:
        claims = decode_token(payload.refresh_token, "refresh")
    except jwt.PyJWTError:
        return Message(detail="Signed out")
    session = db.get(UserSession, claims.get("sid"))
    if session is not None and session.user_id == user.id:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return Message(detail="Signed out")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.get("/household", response_model=list[UserOut])
def household(db: DB, user: CurrentUser) -> list[User]:
    """Both members, so the client can attribute and filter records by person."""
    return list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.created_at)).all())


@router.patch("/me", response_model=UserOut)
def update_profile(payload: UpdateProfileRequest, db: DB, user: CurrentUser) -> User:
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=Message)
def change_password(payload: ChangePasswordRequest, db: DB, user: CurrentUser) -> Message:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    # Every other session is invalidated when the password changes.
    for session in db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
        session.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return Message(detail="Password updated. Please sign in again.")
