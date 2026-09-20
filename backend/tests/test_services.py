"""Service-level tests for aggregation and forecasting against a real session."""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta

from app.models import Loan, RecurringRule, Transaction
from app.services.analytics import (
    category_breakdown,
    daily_cash_flow,
    lifetime_net_before,
    monthly_cash_flow,
    totals_between,
    upcoming_payments,
)
from app.services.forecast import build_forecast
from app.services.finance import ZERO, month_bounds

TODAY = date.today()
START, END = month_bounds(TODAY)


def add_expense(db, user, amount, on, category=None, scope="shared", **kw):
    txn = Transaction(
        type="expense",
        amount=Decimal(str(amount)),
        title=kw.pop("title", "Test"),
        occurred_on=on,
        payment_method="upi",
        scope=scope,
        category_id=category.id if category else None,
        user_id=user.id,
        **kw,
    )
    db.add(txn)
    db.commit()
    return txn


def add_income(db, user, amount, on, category=None, scope="shared"):
    txn = Transaction(
        type="income",
        amount=Decimal(str(amount)),
        title="Salary",
        occurred_on=on,
        payment_method="bank",
        scope=scope,
        category_id=category.id if category else None,
        user_id=user.id,
    )
    db.add(txn)
    db.commit()
    return txn


class TestTotals:
    def test_totals_respect_the_date_range(self, db, users, categories):
        aswin, _ = users
        add_expense(db, aswin, 1000, START)
        add_expense(db, aswin, 500, START - timedelta(days=1))
        income, expenses = totals_between(db, aswin.id, START, END)
        assert expenses == Decimal("1000.00")
        assert income == ZERO

    def test_soft_deleted_rows_are_excluded(self, db, users):
        aswin, _ = users
        txn = add_expense(db, aswin, 1000, START)
        assert totals_between(db, aswin.id, START, END)[1] == Decimal("1000.00")

        from datetime import datetime, timezone

        txn.deleted_at = datetime.now(timezone.utc)
        db.commit()
        assert totals_between(db, aswin.id, START, END)[1] == ZERO

    def test_personal_rows_are_invisible_to_the_other_member(self, db, users):
        aswin, salini = users
        add_expense(db, aswin, 1000, START, scope="personal")
        assert totals_between(db, aswin.id, START, END)[1] == Decimal("1000.00")
        assert totals_between(db, salini.id, START, END)[1] == ZERO

    def test_opening_balance_accumulates_prior_periods(self, db, users):
        aswin, _ = users
        add_income(db, aswin, 50000, START - relativedelta(months=2))
        add_expense(db, aswin, 20000, START - relativedelta(months=1))
        assert lifetime_net_before(db, aswin.id, START) == Decimal("30000.00")


class TestBreakdowns:
    def test_category_shares_sum_to_a_hundred(self, db, users, categories):
        aswin, _ = users
        add_expense(db, aswin, 600, START, categories["groceries"])
        add_expense(db, aswin, 400, START, categories["transport"])
        rows = category_breakdown(db, aswin.id, START, END)
        assert [r["share_pct"] for r in rows] == [60.0, 40.0]
        assert sum(r["share_pct"] for r in rows) == 100.0

    def test_uncategorised_spend_is_labelled_not_dropped(self, db, users):
        aswin, _ = users
        add_expense(db, aswin, 750, START)
        rows = category_breakdown(db, aswin.id, START, END)
        assert len(rows) == 1
        assert rows[0]["name"] == "Uncategorised"
        assert rows[0]["amount"] == Decimal("750.00")


class TestCashFlow:
    def test_daily_series_covers_every_day_and_carries_the_opening(self, db, users):
        aswin, _ = users
        add_expense(db, aswin, 1000, START)
        points = daily_cash_flow(db, aswin.id, START, END, Decimal("5000"))
        assert len(points) == (END - START).days + 1
        assert points[0]["cumulative_net"] == Decimal("4000.00")
        assert points[-1]["cumulative_net"] == Decimal("4000.00")

    def test_monthly_series_returns_one_point_per_month(self, db, users):
        aswin, _ = users
        points = monthly_cash_flow(db, aswin.id, 6, END)
        assert len(points) == 6


class TestUpcoming:
    def test_loans_and_recurring_expenses_appear_in_due_order(self, db, users, categories):
        aswin, _ = users
        soon = TODAY + timedelta(days=3)
        later = TODAY + timedelta(days=20)

        db.add(
            Loan(
                name="Car EMI", debt_type="loan", principal_amount=Decimal("500000"),
                outstanding_balance=Decimal("300000"), emi_amount=Decimal("9155"),
                due_day=soon.day, next_due_date=soon, user_id=aswin.id, scope="shared",
            )
        )
        db.add(
            RecurringRule(
                title="Rent", type="expense", amount=Decimal("18000"), frequency="monthly",
                day_of_month=later.day, start_date=TODAY, next_run_on=later,
                user_id=aswin.id, scope="shared",
            )
        )
        db.commit()

        items = upcoming_payments(db, aswin.id, TODAY)
        assert [item["title"] for item in items] == ["Car EMI", "Rent"]
        assert items[0]["days_until"] == 3

    def test_closed_loans_are_not_upcoming(self, db, users):
        aswin, _ = users
        db.add(
            Loan(
                name="Paid off", debt_type="loan", principal_amount=Decimal("100000"),
                outstanding_balance=Decimal("0"), emi_amount=Decimal("5000"),
                due_day=TODAY.day, next_due_date=TODAY + timedelta(days=2),
                status="closed", user_id=aswin.id, scope="shared",
            )
        )
        db.commit()
        assert upcoming_payments(db, aswin.id, TODAY) == []


class TestForecastService:
    def test_recurring_income_beats_the_historical_average(self, db, users, categories):
        aswin, _ = users
        # A single unusual month should not set the baseline when a rule exists.
        add_income(db, aswin, 20000, START - relativedelta(months=1))
        db.add(
            RecurringRule(
                title="Salary", type="income", amount=Decimal("71000"), frequency="monthly",
                day_of_month=1, start_date=START - relativedelta(months=6),
                next_run_on=START + relativedelta(months=1), user_id=aswin.id, scope="shared",
            )
        )
        db.commit()
        result = build_forecast(db, aswin.id, TODAY, 3)
        assert result["baseline_monthly_income"] == Decimal("71000.00")

    def test_emi_expenses_are_excluded_from_the_expense_baseline(self, db, users, categories):
        aswin, _ = users
        last_month = START - relativedelta(months=1)
        db.add(
            Loan(
                name="Car EMI", debt_type="loan", principal_amount=Decimal("500000"),
                outstanding_balance=Decimal("100000"), emi_amount=Decimal("10000"),
                due_day=5, next_due_date=START.replace(day=5),
                category_id=categories["emi"].id, user_id=aswin.id, scope="shared",
            )
        )
        db.commit()
        add_expense(db, aswin, 10000, last_month, categories["emi"], title="Car EMI payment")
        add_expense(db, aswin, 4000, last_month, categories["groceries"])

        result = build_forecast(db, aswin.id, TODAY, 3)
        assert result["baseline_monthly_expense"] == Decimal("4000.00")
        assert result["baseline_monthly_emi"] == Decimal("10000.00")

    def test_projected_balance_compounds_month_on_month(self, db, users):
        aswin, _ = users
        result = build_forecast(
            db, aswin.id, TODAY, 3, income_override=Decimal("50000"), expense_override=Decimal("30000")
        )
        balances = [m["projected_closing_balance"] for m in result["months"]]
        assert balances == [Decimal("20000.00"), Decimal("40000.00"), Decimal("60000.00")]

    def test_an_unclearable_loan_still_projects_a_finite_horizon(self, db, users):
        aswin, _ = users
        db.add(
            Loan(
                name="Minimum payment only", debt_type="credit_card",
                principal_amount=Decimal("100000"), outstanding_balance=Decimal("100000"),
                emi_amount=Decimal("500"), interest_rate_annual=Decimal("42.000"),
                due_day=5, next_due_date=START.replace(day=5), user_id=aswin.id, scope="shared",
            )
        )
        db.commit()
        result = build_forecast(db, aswin.id, TODAY, 6)
        # The EMI never clears the balance, so it runs for the whole horizon
        # rather than dropping to zero at some invented point.
        assert all(m["projected_emi"] == Decimal("500.00") for m in result["months"])

    def test_a_brand_new_account_forecasts_zeroes_rather_than_failing(self, db, users):
        aswin, _ = users
        result = build_forecast(db, aswin.id, TODAY, 6)
        assert result["actual_balance"] == ZERO
        assert len(result["months"]) == 6
        assert all(m["is_estimate"] for m in result["months"])
