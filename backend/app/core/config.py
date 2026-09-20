"""Centralised application settings.

All values can be overridden via environment variables or a `.env` file in
the backend directory. Only two users are ever allowed to exist; they are
seeded from the settings below by `python -m app.seed`.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Finman API"
    environment: str = "development"
    debug: bool = False

    # PostgreSQL in production. SQLite is accepted as a zero-setup fallback for
    # local development and tests (`sqlite:///./finman.db`).
    database_url: str = "postgresql+psycopg://finman:finman@localhost:5432/finman"

    secret_key: str = Field(default="change-me-in-production-please-use-a-long-random-value")
    access_token_minutes: int = 60 * 12
    refresh_token_days: int = 30
    algorithm: str = "HS256"

    currency: str = "INR"
    timezone: str = "Asia/Kolkata"

    # The only two accounts the system allows.
    user_one_username: str = "aswin"
    user_one_display_name: str = "Aswin"
    user_one_password: str = "aswin1234"
    user_two_username: str = "salini"
    user_two_display_name: str = "Salini"
    user_two_password: str = "salini1234"

    # When true, `python -m app.seed --demo` loads clearly-labelled demo data.
    allow_demo_seed: bool = True

    cors_origins: list[str] = ["*"]


DEFAULT_SECRET = "change-me-in-production-please-use-a-long-random-value"
DEFAULT_PASSWORDS = {"aswin1234", "salini1234"}
# Markers that betray a copied example or development key, which would
# otherwise slip past the length check.
PLACEHOLDER_MARKERS = ("change-me", "dev-only", "example", "secret-key", "not-for-production")


class ConfigurationError(RuntimeError):
    """Raised when the deployment would be unsafe to run as configured."""


def _check_production_safety(settings: Settings) -> None:
    """Refuse to serve real data with placeholder credentials.

    Development is left alone. Anything else is reachable from the internet,
    where a known signing key means anyone can mint a valid session.
    """
    if settings.environment.lower() in {"development", "dev", "test", "testing"}:
        return

    problems: list[str] = []
    lowered = settings.secret_key.lower()
    if (
        settings.secret_key == DEFAULT_SECRET
        or len(settings.secret_key) < 32
        or any(marker in lowered for marker in PLACEHOLDER_MARKERS)
    ):
        problems.append(
            "SECRET_KEY is missing, too short, or still the example value. "
            'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    if settings.user_one_password in DEFAULT_PASSWORDS or settings.user_two_password in DEFAULT_PASSWORDS:
        problems.append(
            "USER_ONE_PASSWORD and USER_TWO_PASSWORD are still the example values. "
            "Set both to passwords only you two know."
        )
    if settings.allow_demo_seed:
        problems.append("ALLOW_DEMO_SEED must be false outside development.")

    if problems:
        raise ConfigurationError(
            "Refusing to start with an unsafe configuration:\n  - " + "\n  - ".join(problems)
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _check_production_safety(settings)
    return settings
