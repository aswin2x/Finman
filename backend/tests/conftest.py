from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator

import pytest

# Each test session gets an isolated SQLite file. Must be set before the app
# modules import their settings.
_TMP_DB = os.path.join(tempfile.mkdtemp(prefix="finman-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["SECRET_KEY"] = "test-secret-key-not-used-anywhere-real"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Category, User  # noqa: E402
from app.core.security import hash_password  # noqa: E402


@pytest.fixture(scope="function", autouse=True)
def fresh_schema() -> Iterator[None]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def users(db: Session) -> tuple[User, User]:
    aswin = User(username="aswin", display_name="Aswin", password_hash=hash_password("aswin1234"))
    salini = User(username="salini", display_name="Salini", password_hash=hash_password("salini1234"))
    db.add_all([aswin, salini])
    db.commit()
    db.refresh(aswin)
    db.refresh(salini)
    return aswin, salini


@pytest.fixture
def categories(db: Session) -> dict[str, Category]:
    rows = {
        "groceries": Category(name="Groceries", kind="expense", color="#F2A65A"),
        "transport": Category(name="Transport", kind="expense", color="#5B8FF9"),
        "emi": Category(name="EMI & Loans", kind="expense", color="#F87171"),
        "salary": Category(name="Salary", kind="income", color="#34D399"),
    }
    db.add_all(list(rows.values()))
    db.commit()
    for row in rows.values():
        db.refresh(row)
    return rows


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth(client: TestClient, users) -> dict[str, str]:
    token = client.post("/api/v1/auth/login", json={"username": "aswin", "password": "aswin1234"}).json()
    return {"Authorization": f"Bearer {token['access_token']}"}


@pytest.fixture
def auth_salini(client: TestClient, users) -> dict[str, str]:
    token = client.post("/api/v1/auth/login", json={"username": "salini", "password": "salini1234"}).json()
    return {"Authorization": f"Bearer {token['access_token']}"}
