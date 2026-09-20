"""Seed the database.

    python -m app.seed             # users + default categories only
    python -m app.seed --demo      # also loads clearly-tagged demo records

Demo rows carry `import_batch_id == "demo-seed"`, which the dashboard reports
as `is_demo_data` and `--clear-demo` removes. Nothing here is hardcoded into
the UI; the client only ever renders what the API returns.
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Budget,
    Category,
    Loan,
    LoanPayment,
    RecurringRule,
    Settlement,
    SettlementPayment,
    Transaction,
    User,
)
from app.services.finance import month_bounds, next_due_after, safe_day

DEMO_BATCH = "demo-seed"

DEFAULT_EXPENSE_CATEGORIES = [
    ("Housing", "home", "#FF6B4A"),
    ("Groceries", "cart", "#F2A65A"),
    ("Transport", "car", "#5B8FF9"),
    ("Utilities", "bolt", "#9B8AFB"),
    ("Dining", "cup", "#FF8A65"),
    ("Entertainment", "play", "#EC4899"),
    ("Health", "heart", "#34D399"),
    ("Shopping", "bag", "#FBBF24"),
    ("EMI & Loans", "bank", "#F87171"),
    ("Education", "book", "#38BDF8"),
    ("Personal Care", "spark", "#C084FC"),
    ("Miscellaneous", "tag", "#8A8F98"),
]

DEFAULT_INCOME_CATEGORIES = [
    ("Salary", "wallet", "#34D399"),
    ("Freelance", "laptop", "#5B8FF9"),
    ("Interest", "percent", "#FBBF24"),
    ("Other Income", "plus", "#8A8F98"),
]


def ensure_schema() -> None:
    Base.metadata.create_all(engine)


def seed_users(db) -> tuple[User, User]:
    settings = get_settings()
    pairs = [
        (settings.user_one_username, settings.user_one_display_name, settings.user_one_password, "#FF6B4A"),
        (settings.user_two_username, settings.user_two_display_name, settings.user_two_password, "#5B8FF9"),
    ]
    users: list[User] = []
    for username, display_name, password, color in pairs:
        user = db.scalar(select(User).where(User.username == username.lower()))
        if user is None:
            user = User(
                username=username.lower(),
                display_name=display_name,
                password_hash=hash_password(password),
                avatar_color=color,
            )
            db.add(user)
            db.flush()
        users.append(user)
    db.commit()
    return users[0], users[1]


def seed_categories(db) -> dict[str, Category]:
    existing = {c.name.lower(): c for c in db.scalars(select(Category)).all()}
    order = 0
    for name, icon, color in DEFAULT_EXPENSE_CATEGORIES:
        if name.lower() not in existing:
            category = Category(name=name, kind="expense", icon=icon, color=color, sort_order=order, is_system=True)
            db.add(category)
            db.flush()
            existing[name.lower()] = category
        order += 1
    for name, icon, color in DEFAULT_INCOME_CATEGORIES:
        if name.lower() not in existing:
            category = Category(name=name, kind="income", icon=icon, color=color, sort_order=order, is_system=True)
            db.add(category)
            db.flush()
            existing[name.lower()] = category
        order += 1
    db.commit()
    return existing


def clear_demo(db) -> None:
    db.execute(delete(Transaction).where(Transaction.import_batch_id == DEMO_BATCH))
    for model in (SettlementPayment, LoanPayment):
        db.execute(delete(model))
    for model in (Settlement, Loan, Budget, RecurringRule):
        db.execute(delete(model))
    db.commit()


def seed_demo(db, aswin: User, salini: User, cats: dict[str, Category]) -> None:
    """Load a coherent month of household activity for evaluating the UI."""
    today = date.today()
    start, end = month_bounds(today)

    def cat(name: str):
        return cats[name.lower()].id

    # Recurring income and fixed costs.
    salary_day = 1
    db.add_all(
        [
            RecurringRule(
                title="Salary", type="income", amount=Decimal("71000.00"), frequency="monthly",
                day_of_month=salary_day, start_date=start - relativedelta(months=6),
                next_run_on=safe_day((start + relativedelta(months=1)).year, (start + relativedelta(months=1)).month, salary_day),
                auto_post=False, payment_method="bank", scope="shared",
                category_id=cat("Salary"), user_id=aswin.id,
            ),
            RecurringRule(
                title="House Rent", type="expense", amount=Decimal("18000.00"), frequency="monthly",
                day_of_month=5, start_date=start - relativedelta(months=6),
                next_run_on=safe_day((start + relativedelta(months=1)).year, (start + relativedelta(months=1)).month, 5),
                auto_post=False, payment_method="bank", scope="shared",
                category_id=cat("Housing"), user_id=aswin.id,
            ),
            RecurringRule(
                title="Broadband", type="expense", amount=Decimal("1099.00"), frequency="monthly",
                day_of_month=12, start_date=start - relativedelta(months=6),
                next_run_on=safe_day(start.year, start.month, 12) if safe_day(start.year, start.month, 12) >= today
                else safe_day((start + relativedelta(months=1)).year, (start + relativedelta(months=1)).month, 12),
                auto_post=False, payment_method="upi", scope="shared",
                category_id=cat("Utilities"), user_id=salini.id,
            ),
        ]
    )

    # Debts, with outstanding balances maintained independently of EMI x tenure.
    car = Loan(
        name="Car EMI", lender="HDFC Bank", debt_type="loan",
        principal_amount=Decimal("650000.00"), outstanding_balance=Decimal("412500.00"),
        emi_amount=Decimal("9155.00"), interest_rate_annual=Decimal("9.100"),
        tenure_months=84, months_paid=26, start_date=start - relativedelta(months=26),
        due_day=7, next_due_date=next_due_after(None, 7, today - timedelta(days=1)),
        category_id=cat("EMI & Loans"), user_id=aswin.id, scope="shared",
    )
    bajaj = Loan(
        name="Bajaj EMI", lender="Bajaj Finserv", debt_type="bnpl",
        principal_amount=Decimal("140400.00"), outstanding_balance=Decimal("74100.00"),
        emi_amount=Decimal("3900.00"), interest_rate_annual=None,
        tenure_months=36, months_paid=17, start_date=start - relativedelta(months=17),
        due_day=3, next_due_date=next_due_after(None, 3, today - timedelta(days=1)),
        category_id=cat("EMI & Loans"), user_id=aswin.id, scope="shared",
    )
    personal = Loan(
        name="Personal Loan", lender="ICICI Bank", debt_type="loan",
        principal_amount=Decimal("500000.00"), outstanding_balance=Decimal("286400.00"),
        emi_amount=Decimal("15802.00"), interest_rate_annual=Decimal("11.500"),
        tenure_months=48, months_paid=19, start_date=start - relativedelta(months=19),
        due_day=10, next_due_date=next_due_after(None, 10, today - timedelta(days=1)),
        category_id=cat("EMI & Loans"), user_id=salini.id, scope="shared",
    )
    card = Loan(
        name="HDFC Credit Card", lender="HDFC Bank", debt_type="credit_card",
        principal_amount=Decimal("48000.00"), outstanding_balance=Decimal("18420.00"),
        emi_amount=Decimal("10000.00"), interest_rate_annual=Decimal("42.000"),
        tenure_months=None, months_paid=0, due_day=18,
        next_due_date=next_due_after(None, 18, today - timedelta(days=1)),
        category_id=cat("EMI & Loans"), user_id=aswin.id, scope="shared",
    )
    db.add_all([car, bajaj, personal, card])

    # Settlements with a partial payment so the UI shows every status.
    stephen = Settlement(
        person_name="Stephen", direction="we_owe", total_amount=Decimal("1750.00"),
        expected_date=today + timedelta(days=9), status="pending", is_verified=True,
        notes="Split for the weekend trip", user_id=aswin.id, scope="shared",
    )
    jilsha = Settlement(
        person_name="Jilsha", direction="we_owe", total_amount=Decimal("3000.00"),
        expected_date=today + timedelta(days=20), status="pending", is_verified=False,
        user_id=salini.id, scope="shared",
    )
    alexa = Settlement(
        person_name="Alexa", direction="we_owe", total_amount=Decimal("10000.00"),
        expected_date=today + timedelta(days=35), status="partial", is_verified=False,
        user_id=aswin.id, scope="shared",
    )
    arun = Settlement(
        person_name="Arun", direction="owed_to_us", total_amount=Decimal("4500.00"),
        expected_date=today + timedelta(days=14), status="pending", is_verified=True,
        notes="Lent for laptop repair", user_id=salini.id, scope="shared",
    )
    db.add_all([stephen, jilsha, alexa, arun])
    db.flush()
    db.add(
        SettlementPayment(
            settlement_id=alexa.id, amount=Decimal("2500.00"),
            paid_on=today - timedelta(days=6), note="First instalment",
            recorded_by_user_id=aswin.id,
        )
    )

    # Budgets for the current month.
    budget_plan = [
        ("Housing", "20000.00", 90),
        ("Groceries", "12000.00", 80),
        ("Transport", "6000.00", 80),
        ("Dining", "5000.00", 75),
        ("Entertainment", "4000.00", 70),
        ("Utilities", "4500.00", 85),
        ("Shopping", "6000.00", 70),
    ]
    for name, limit, threshold in budget_plan:
        db.add(
            Budget(
                name=name, limit_amount=Decimal(limit), period_type="monthly",
                period_start=start, period_end=end, rollover=name in {"Shopping", "Entertainment"},
                alert_threshold_pct=threshold, scope="shared",
                category_id=cat(name), user_id=aswin.id,
            )
        )

    # Three months of activity so charts, averages and forecasts have substance.
    pattern = [
        ("Groceries", "Groceries", [1450, 980], "upi"),
        ("Transport", "Petrol", [1800], "card"),
        ("Transport", "Cab ride", [320, 280], "upi"),
        ("Dining", "Dinner out", [890, 640], "card"),
        ("Entertainment", "Streaming", [649], "card"),
        ("Entertainment", "Movie night", [420], "upi"),
        ("Utilities", "Electricity", [1240], "bank"),
        ("Utilities", "Mobile recharge", [599], "upi"),
        ("Health", "Pharmacy", [640], "cash"),
        ("Shopping", "Clothing", [890], "card"),
        ("Personal Care", "Salon", [450], "cash"),
        ("Miscellaneous", "Household items", [560, 340], "cash"),
    ]

    users = [aswin, salini]

    # Savings carried in from before tracking began. Dated outside the window
    # the forecast averages, so it cannot distort the baseline income figure.
    earliest_start, _ = month_bounds(today - relativedelta(months=5))
    db.add(
        Transaction(
            type="income", amount=Decimal("185000.00"), title="Opening savings balance",
            notes="Carried forward before tracking began",
            occurred_on=earliest_start, payment_method="bank", scope="shared",
            category_id=cat("Other Income"), user_id=aswin.id,
            is_imported=True, import_batch_id=DEMO_BATCH,
        )
    )

    for month_offset in range(2, -1, -1):
        m_start, m_end = month_bounds(today - relativedelta(months=month_offset))
        limit_day = (today if month_offset == 0 else m_end)

        db.add(
            Transaction(
                type="income", amount=Decimal("71000.00"), title="Salary",
                occurred_on=safe_day(m_start.year, m_start.month, 1), payment_method="bank",
                scope="shared", category_id=cat("Salary"), user_id=aswin.id,
                is_imported=True, import_batch_id=DEMO_BATCH,
            )
        )
        db.add(
            Transaction(
                type="expense", amount=Decimal("18000.00"), title="House Rent",
                occurred_on=safe_day(m_start.year, m_start.month, 5), payment_method="bank",
                scope="shared", category_id=cat("Housing"), user_id=aswin.id,
                is_imported=True, import_batch_id=DEMO_BATCH,
            )
        )

        day_cursor = 2
        person_index = 0
        for category_name, title, amounts, method in pattern:
            for amount in amounts:
                occurred = safe_day(m_start.year, m_start.month, min(28, day_cursor))
                if occurred > limit_day:
                    day_cursor = 2
                    occurred = safe_day(m_start.year, m_start.month, 2)
                    if occurred > limit_day:
                        continue
                db.add(
                    Transaction(
                        type="expense", amount=Decimal(str(amount)), title=title,
                        occurred_on=occurred, payment_method=method, scope="shared",
                        category_id=cat(category_name), user_id=users[person_index % 2].id,
                        is_imported=True, import_batch_id=DEMO_BATCH,
                    )
                )
                day_cursor += 2
                person_index += 1

        # EMI outflows, recorded as real loan payments with their linked
        # expense. The link is what marks them as debt repayment, so the
        # forecast can project EMI from live balances without counting it
        # twice through the historical expense average.
        for loan in (car, bajaj, personal):
            paid_on = safe_day(m_start.year, m_start.month, loan.due_day)
            if paid_on > limit_day:
                continue
            payment = LoanPayment(
                loan_id=loan.id, amount=loan.emi_amount, paid_on=paid_on,
                payment_type="emi", paid_by_user_id=loan.user_id,
            )
            db.add(payment)
            db.flush()
            txn = Transaction(
                type="expense", amount=loan.emi_amount, title=f"{loan.name} payment",
                occurred_on=paid_on, payment_method="bank", scope="shared",
                category_id=cat("EMI & Loans"), user_id=loan.user_id,
                loan_payment_id=payment.id,
                is_imported=True, import_batch_id=DEMO_BATCH,
            )
            db.add(txn)
            db.flush()
            payment.transaction_id = txn.id

    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Finman database")
    parser.add_argument("--demo", action="store_true", help="load demo household data")
    parser.add_argument("--clear-demo", action="store_true", help="remove demo data")
    args = parser.parse_args()

    ensure_schema()
    with SessionLocal() as db:
        aswin, salini = seed_users(db)
        cats = seed_categories(db)
        if args.clear_demo:
            clear_demo(db)
            print("Demo data cleared.")
        if args.demo:
            if not get_settings().allow_demo_seed:
                raise SystemExit("Demo seeding is disabled by configuration (allow_demo_seed=false).")
            clear_demo(db)
            seed_demo(db, aswin, salini, cats)
            print("Demo data loaded and tagged as demo-seed.")
    print(f"Ready. Users: {aswin.display_name}, {salini.display_name}. Categories: {len(cats)}.")


if __name__ == "__main__":
    main()
