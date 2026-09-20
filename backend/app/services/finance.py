"""Pure financial calculations.

Everything here is deliberately free of database and request objects so the
numbers can be unit-tested directly. Money is always `Decimal`, quantised to
two places with banker-safe ROUND_HALF_UP.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from dateutil.relativedelta import relativedelta

TWO_PLACES = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | float | str | None) -> Decimal:
    """Coerce any numeric input to a 2-decimal Decimal."""
    if value is None:
        return ZERO
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def total(values: Iterable[Decimal | int | float | None]) -> Decimal:
    return money(sum((money(v) for v in values), ZERO))


def month_bounds(anchor: date) -> tuple[date, date]:
    """First and last day of the month containing `anchor`."""
    start = anchor.replace(day=1)
    end = start + relativedelta(months=1) - timedelta(days=1)
    return start, end


def safe_day(year: int, month: int, day: int) -> date:
    """Clamp a day-of-month to a month that may be shorter (e.g. 31 Feb)."""
    first = date(year, month, 1)
    last_day = (first + relativedelta(months=1) - timedelta(days=1)).day
    return date(year, month, min(day, last_day))


def pct(part: Decimal, whole: Decimal) -> float:
    """Percentage of `whole` represented by `part`; 0 when whole is 0."""
    whole = money(whole)
    if whole == ZERO:
        return 0.0
    return float((money(part) / whole * Decimal(100)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def change_pct(current: Decimal, previous: Decimal) -> float | None:
    """Period-over-period change. None when there is no comparable base."""
    previous = money(previous)
    if previous == ZERO:
        return None
    delta = money(current) - previous
    return float((delta / previous * Decimal(100)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def emi_for(principal: Decimal, annual_rate_pct: Decimal | float | None, months: int) -> Decimal:
    """Standard reducing-balance EMI.

    Falls back to straight-line division when no interest rate is supplied.
    """
    principal = money(principal)
    if months <= 0:
        return ZERO
    if not annual_rate_pct:
        return money(principal / Decimal(months))
    r = Decimal(str(annual_rate_pct)) / Decimal(1200)
    factor = (Decimal(1) + r) ** months
    return money(principal * r * factor / (factor - Decimal(1)))


def months_to_clear(outstanding: Decimal, emi: Decimal, annual_rate_pct: Decimal | float | None = None) -> int | None:
    """How many EMIs are needed to clear `outstanding`.

    Returns None when the EMI can never clear the balance (EMI at or below the
    monthly interest accrual), so callers never display a fabricated date.
    """
    outstanding = money(outstanding)
    emi = money(emi)
    if outstanding <= ZERO:
        return 0
    if emi <= ZERO:
        return None
    if not annual_rate_pct:
        months = (outstanding / emi).to_integral_value(rounding=ROUND_HALF_UP)
        return max(1, int(months)) if outstanding % emi == 0 else int(outstanding / emi) + 1

    r = Decimal(str(annual_rate_pct)) / Decimal(1200)
    if emi <= outstanding * r:
        return None
    balance = outstanding
    months = 0
    # Bounded loop: 600 months is the maximum tenure the API accepts.
    while balance > ZERO and months < 600:
        balance = money(balance + balance * r - emi)
        months += 1
    return months if balance <= ZERO else None


def expected_completion(
    outstanding: Decimal,
    emi: Decimal,
    annual_rate_pct: Decimal | float | None,
    next_due: date | None,
) -> date | None:
    months = months_to_clear(outstanding, emi, annual_rate_pct)
    if months is None or next_due is None:
        return None
    if months == 0:
        return next_due
    return next_due + relativedelta(months=months - 1)


def loan_progress_pct(principal: Decimal, outstanding: Decimal) -> float:
    """Share of the original principal already repaid."""
    principal = money(principal)
    if principal <= ZERO:
        return 0.0
    repaid = principal - money(outstanding)
    if repaid <= ZERO:
        return 0.0
    return min(100.0, pct(repaid, principal))


def next_due_after(current_due: date | None, due_day: int, reference: date) -> date:
    """The next due date strictly after `reference`."""
    base = current_due or safe_day(reference.year, reference.month, due_day)
    guard = 0
    while base <= reference and guard < 600:
        nxt = base + relativedelta(months=1)
        base = safe_day(nxt.year, nxt.month, due_day)
        guard += 1
    return base


def advance_recurring(next_run: date, frequency: str, day_of_month: int) -> date:
    if frequency == "weekly":
        return next_run + timedelta(days=7)
    if frequency == "yearly":
        nxt = next_run + relativedelta(years=1)
        return safe_day(nxt.year, nxt.month, day_of_month)
    nxt = next_run + relativedelta(months=1)
    return safe_day(nxt.year, nxt.month, day_of_month)


def occurrences_in_month(rule_freq: str, month_start: date) -> int:
    """How many times a recurring rule fires within one calendar month."""
    if rule_freq == "weekly":
        end = month_start + relativedelta(months=1) - timedelta(days=1)
        return ((end - month_start).days + 1) // 7
    if rule_freq == "yearly":
        return 0  # handled separately by matching the anniversary month
    return 1


def budget_state(used_pct_value: float, threshold_pct: int) -> str:
    if used_pct_value > 100:
        return "over"
    if used_pct_value >= threshold_pct:
        return "warning"
    return "on_track"


def daily_allowance(remaining: Decimal, days_left: int) -> Decimal:
    remaining = money(remaining)
    if days_left <= 0 or remaining <= ZERO:
        return ZERO
    return money(remaining / Decimal(days_left))


def settlement_status(total_amount: Decimal, paid: Decimal) -> str:
    total_amount = money(total_amount)
    paid = money(paid)
    if paid <= ZERO:
        return "pending"
    if paid >= total_amount:
        return "settled"
    return "partial"
