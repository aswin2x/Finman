"""Unit tests for the pure financial calculations."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services.finance import (
    ZERO,
    advance_recurring,
    budget_state,
    change_pct,
    daily_allowance,
    emi_for,
    expected_completion,
    loan_progress_pct,
    money,
    month_bounds,
    months_to_clear,
    next_due_after,
    pct,
    safe_day,
    settlement_status,
    total,
)


class TestMoney:
    def test_rounds_to_two_places_half_up(self):
        assert money(Decimal("1234.567")) == Decimal("1234.57")
        assert money(Decimal("1234.565")) == Decimal("1234.57")
        assert money(Decimal("1234.564")) == Decimal("1234.56")

    def test_accepts_mixed_input_types(self):
        assert money(1500) == Decimal("1500.00")
        assert money("99.9") == Decimal("99.90")
        assert money(None) == ZERO

    def test_float_input_does_not_drift(self):
        # 0.1 + 0.2 in binary floats is 0.30000000000000004.
        assert total([0.1, 0.2]) == Decimal("0.30")

    def test_summing_many_values_stays_exact(self):
        assert total([Decimal("0.01")] * 1000) == Decimal("10.00")


class TestPercentages:
    def test_basic_share(self):
        assert pct(Decimal("50"), Decimal("200")) == 25.0

    def test_zero_denominator_is_zero_not_error(self):
        assert pct(Decimal("50"), ZERO) == 0.0

    def test_change_pct_positive_and_negative(self):
        assert change_pct(Decimal("110"), Decimal("100")) == 10.0
        assert change_pct(Decimal("90"), Decimal("100")) == -10.0

    def test_change_pct_without_base_is_none(self):
        # No previous figure means no comparison, rather than a fake 100%.
        assert change_pct(Decimal("500"), ZERO) is None


class TestEmi:
    def test_known_reducing_balance_value(self):
        # 5,00,000 at 9.5% for 60 months.
        assert emi_for(Decimal("500000"), 9.5, 60) == Decimal("10500.93")

    def test_zero_rate_is_straight_line(self):
        assert emi_for(Decimal("120000"), None, 12) == Decimal("10000.00")
        assert emi_for(Decimal("120000"), 0, 12) == Decimal("10000.00")

    def test_non_positive_tenure_is_zero(self):
        assert emi_for(Decimal("100000"), 10, 0) == ZERO


class TestMonthsToClear:
    def test_interest_free_rounds_up_partial_month(self):
        # 100000 / 9155 = 10.92, so 11 payments are needed.
        assert months_to_clear(Decimal("100000"), Decimal("9155")) == 11

    def test_exact_division_has_no_extra_month(self):
        assert months_to_clear(Decimal("100000"), Decimal("10000")) == 10

    def test_with_interest_takes_longer_than_without(self):
        plain = months_to_clear(Decimal("300000"), Decimal("9155"))
        with_interest = months_to_clear(Decimal("300000"), Decimal("9155"), 9.5)
        assert with_interest > plain

    def test_emi_below_interest_never_clears(self):
        # 1,00,000 at 24% accrues 2,000 a month; a 500 EMI cannot clear it.
        assert months_to_clear(Decimal("100000"), Decimal("500"), 24) is None

    def test_zero_balance_needs_no_payments(self):
        assert months_to_clear(ZERO, Decimal("9155")) == 0

    def test_zero_emi_cannot_clear_a_balance(self):
        assert months_to_clear(Decimal("1000"), ZERO) is None


class TestOutstandingIsNotDerived:
    def test_progress_uses_recorded_balance_not_emi_times_tenure(self):
        """A loan's progress must follow the recorded outstanding balance.

        EMI x remaining tenure would imply a different figure; the recorded
        balance wins.
        """
        principal = Decimal("650000")
        outstanding = Decimal("412500")
        emi = Decimal("9155")
        remaining_months = 58

        derived = money(emi * remaining_months)  # 5,30,990 - not the truth
        assert derived != outstanding
        assert loan_progress_pct(principal, outstanding) == pytest.approx(36.5, abs=0.1)

    def test_progress_clamped_between_zero_and_hundred(self):
        assert loan_progress_pct(Decimal("100000"), Decimal("120000")) == 0.0
        assert loan_progress_pct(Decimal("100000"), ZERO) == 100.0
        assert loan_progress_pct(ZERO, ZERO) == 0.0


class TestExpectedCompletion:
    def test_completion_counts_from_next_due_date(self):
        # 11 payments starting 5 Oct 2026 finish on 5 Aug 2027.
        assert expected_completion(Decimal("100000"), Decimal("9155"), None, date(2026, 10, 5)) == date(2027, 8, 5)

    def test_no_due_date_means_no_projection(self):
        assert expected_completion(Decimal("100000"), Decimal("9155"), None, None) is None

    def test_unclearable_loan_has_no_completion_date(self):
        assert expected_completion(Decimal("100000"), Decimal("500"), 24, date(2026, 10, 5)) is None


class TestDates:
    def test_short_month_clamps_day(self):
        assert safe_day(2026, 2, 31) == date(2026, 2, 28)
        assert safe_day(2028, 2, 30) == date(2028, 2, 29)  # leap year
        assert safe_day(2026, 4, 31) == date(2026, 4, 30)

    def test_month_bounds(self):
        assert month_bounds(date(2026, 9, 17)) == (date(2026, 9, 1), date(2026, 9, 30))
        assert month_bounds(date(2026, 12, 31)) == (date(2026, 12, 1), date(2026, 12, 31))

    def test_next_due_skips_to_following_month(self):
        assert next_due_after(date(2026, 9, 7), 7, date(2026, 9, 7)) == date(2026, 10, 7)

    def test_next_due_handles_month_end_day(self):
        assert next_due_after(date(2026, 1, 31), 31, date(2026, 1, 31)) == date(2026, 2, 28)

    def test_next_due_catches_up_from_the_past(self):
        assert next_due_after(date(2026, 1, 5), 5, date(2026, 6, 20)) == date(2026, 7, 5)

    def test_recurring_advance_by_frequency(self):
        assert advance_recurring(date(2026, 9, 1), "weekly", 1) == date(2026, 9, 8)
        assert advance_recurring(date(2026, 9, 30), "monthly", 30) == date(2026, 10, 30)
        assert advance_recurring(date(2026, 1, 31), "monthly", 31) == date(2026, 2, 28)
        assert advance_recurring(date(2026, 3, 15), "yearly", 15) == date(2027, 3, 15)


class TestBudgetHelpers:
    def test_state_thresholds(self):
        assert budget_state(45.0, 80) == "on_track"
        assert budget_state(80.0, 80) == "warning"
        assert budget_state(100.0, 80) == "warning"
        assert budget_state(100.1, 80) == "over"

    def test_daily_allowance_splits_remaining(self):
        assert daily_allowance(Decimal("3000"), 10) == Decimal("300.00")

    def test_daily_allowance_guards_zero_and_overspend(self):
        assert daily_allowance(Decimal("3000"), 0) == ZERO
        assert daily_allowance(Decimal("-500"), 10) == ZERO


class TestSettlementStatus:
    def test_status_transitions(self):
        assert settlement_status(Decimal("1000"), ZERO) == "pending"
        assert settlement_status(Decimal("1000"), Decimal("400")) == "partial"
        assert settlement_status(Decimal("1000"), Decimal("1000")) == "settled"
        assert settlement_status(Decimal("1000"), Decimal("1200")) == "settled"
