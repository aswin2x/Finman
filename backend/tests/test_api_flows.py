"""End-to-end tests over the HTTP API, focused on financial correctness."""
from __future__ import annotations

from datetime import date, timedelta

from app.services.finance import month_bounds

TODAY = date.today()
START, END = month_bounds(TODAY)


def iso(d: date) -> str:
    return d.isoformat()


def in_month(day: int) -> str:
    return iso(min(START.replace(day=min(day, 28)), TODAY))


def make_expense(client, auth, amount, title="Test", category_id=None, on=None, **kw):
    body = {
        "type": "expense",
        "amount": amount,
        "title": title,
        "occurred_on": on or in_month(2),
        "payment_method": "upi",
        "scope": "shared",
        **kw,
    }
    if category_id:
        body["category_id"] = category_id
    return client.post("/api/v1/transactions", headers=auth, json=body)


class TestAuth:
    def test_login_returns_tokens(self, client, users):
        r = client.post("/api/v1/auth/login", json={"username": "aswin", "password": "aswin1234"})
        assert r.status_code == 200
        assert r.json()["access_token"] and r.json()["refresh_token"]

    def test_wrong_password_rejected(self, client, users):
        r = client.post("/api/v1/auth/login", json={"username": "aswin", "password": "nope"})
        assert r.status_code == 401

    def test_unknown_user_rejected(self, client, users):
        r = client.post("/api/v1/auth/login", json={"username": "ghost", "password": "whatever"})
        assert r.status_code == 401

    def test_protected_route_needs_a_token(self, client, users):
        assert client.get("/api/v1/dashboard").status_code == 401

    def test_garbage_token_rejected(self, client, users):
        r = client.get("/api/v1/dashboard", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401

    def test_refresh_rotates_and_retires_old_session(self, client, users):
        tokens = client.post("/api/v1/auth/login", json={"username": "aswin", "password": "aswin1234"}).json()
        refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert refreshed.status_code == 200
        # The retired refresh token cannot be reused.
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401

    def test_logout_invalidates_the_access_token(self, client, users):
        tokens = client.post("/api/v1/auth/login", json={"username": "aswin", "password": "aswin1234"}).json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert client.get("/api/v1/dashboard", headers=headers).status_code == 200
        client.post("/api/v1/auth/logout", headers=headers, json={"refresh_token": tokens["refresh_token"]})
        assert client.get("/api/v1/dashboard", headers=headers).status_code == 401

    def test_household_lists_both_members(self, client, auth):
        names = [u["display_name"] for u in client.get("/api/v1/auth/household", headers=auth).json()]
        assert names == ["Aswin", "Salini"]


class TestTransactionValidation:
    def test_negative_amount_rejected(self, client, auth):
        assert make_expense(client, auth, -100).status_code == 422

    def test_zero_amount_rejected(self, client, auth):
        assert make_expense(client, auth, 0).status_code == 422

    def test_income_category_rejected_for_expense(self, client, auth, categories):
        r = make_expense(client, auth, 100, category_id=str(categories["salary"].id))
        assert r.status_code == 400
        assert "cannot be used" in r.json()["detail"]

    def test_unknown_category_rejected(self, client, auth):
        r = make_expense(client, auth, 100, category_id="11111111-1111-1111-1111-111111111111")
        assert r.status_code == 400

    def test_amount_stored_to_the_paisa(self, client, auth):
        r = make_expense(client, auth, 1234.56)
        assert r.json()["amount"] == 1234.56


class TestBalances:
    def test_balance_is_income_minus_expenses(self, client, auth, categories):
        client.post(
            "/api/v1/transactions",
            headers=auth,
            json={
                "type": "income", "amount": 71000, "title": "Salary", "occurred_on": in_month(1),
                "payment_method": "bank", "scope": "shared", "category_id": str(categories["salary"].id),
            },
        )
        make_expense(client, auth, 18000, "Rent", str(categories["groceries"].id))
        make_expense(client, auth, 2500, "Shopping", str(categories["groceries"].id))

        d = client.get("/api/v1/dashboard", headers=auth).json()
        assert d["income"] == 71000.0
        assert d["expenses"] == 20500.0
        assert d["net"] == 50500.0
        assert d["available_balance"] == 50500.0

    def test_deleting_an_expense_restores_the_balance(self, client, auth):
        created = make_expense(client, auth, 5000).json()
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 5000.0
        client.delete(f"/api/v1/transactions/{created['id']}", headers=auth)
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0

    def test_restore_brings_the_amount_back(self, client, auth):
        created = make_expense(client, auth, 5000).json()
        client.delete(f"/api/v1/transactions/{created['id']}", headers=auth)
        client.post(f"/api/v1/transactions/{created['id']}/restore", headers=auth)
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 5000.0

    def test_editing_an_amount_updates_the_balance(self, client, auth):
        created = make_expense(client, auth, 5000).json()
        client.patch(f"/api/v1/transactions/{created['id']}", headers=auth, json={"amount": 1500})
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 1500.0

    def test_opening_balance_carries_from_earlier_months(self, client, auth, categories):
        last_month = (START - timedelta(days=1)).replace(day=1)
        client.post(
            "/api/v1/transactions",
            headers=auth,
            json={
                "type": "income", "amount": 50000, "title": "Earlier salary", "occurred_on": iso(last_month),
                "payment_method": "bank", "scope": "shared", "category_id": str(categories["salary"].id),
            },
        )
        make_expense(client, auth, 8000)
        d = client.get("/api/v1/dashboard", headers=auth).json()
        assert d["opening_balance"] == 50000.0
        assert d["available_balance"] == 42000.0


class TestSharedAndPersonalAccess:
    def test_shared_records_are_visible_to_both(self, client, auth, auth_salini):
        make_expense(client, auth, 3000, "Shared groceries")
        assert client.get("/api/v1/dashboard", headers=auth_salini).json()["expenses"] == 3000.0

    def test_personal_records_stay_private(self, client, auth, auth_salini):
        make_expense(client, auth, 3000, "Private", scope="personal")
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 3000.0
        assert client.get("/api/v1/dashboard", headers=auth_salini).json()["expenses"] == 0.0

    def test_another_members_private_category_cannot_be_used(self, client, auth, auth_salini):
        private = client.post(
            "/api/v1/categories",
            headers=auth_salini,
            json={"name": "Private", "kind": "expense", "is_personal": True},
        ).json()
        r = make_expense(client, auth, 500, "Attempt", private["id"])
        assert r.status_code == 400

    def test_another_members_personal_record_is_not_fetchable(self, client, auth, auth_salini):
        created = make_expense(client, auth, 3000, "Private", scope="personal").json()
        assert client.get(f"/api/v1/transactions/{created['id']}", headers=auth_salini).status_code == 404

    def test_either_member_can_edit_a_shared_record(self, client, auth, auth_salini):
        created = make_expense(client, auth, 3000, "Shared").json()
        r = client.patch(f"/api/v1/transactions/{created['id']}", headers=auth_salini, json={"amount": 2000})
        assert r.status_code == 200 and r.json()["amount"] == 2000.0


class TestFiltersAndSearch:
    def test_filters_narrow_the_list(self, client, auth, categories):
        make_expense(client, auth, 500, "Petrol", str(categories["transport"].id), payment_method="card")
        make_expense(client, auth, 300, "Milk", str(categories["groceries"].id), payment_method="cash")

        by_category = client.get(
            f"/api/v1/transactions?category_id={categories['transport'].id}", headers=auth
        ).json()
        assert by_category["total"] == 1 and by_category["items"][0]["title"] == "Petrol"

        by_method = client.get("/api/v1/transactions?payment_method=cash", headers=auth).json()
        assert by_method["total"] == 1 and by_method["items"][0]["title"] == "Milk"

        by_search = client.get("/api/v1/transactions?search=petr", headers=auth).json()
        assert by_search["total"] == 1

        by_amount = client.get("/api/v1/transactions?min_amount=400", headers=auth).json()
        assert by_amount["total"] == 1

    def test_summary_totals_and_category_shares(self, client, auth, categories):
        make_expense(client, auth, 750, "A", str(categories["groceries"].id))
        make_expense(client, auth, 250, "B", str(categories["transport"].id))
        s = client.get("/api/v1/transactions/summary", headers=auth).json()
        assert s["expenses"] == 1000.0
        shares = {c["name"]: c["share_pct"] for c in s["by_category"]}
        assert shares["Groceries"] == 75.0 and shares["Transport"] == 25.0


class TestBudgets:
    def _budget(self, client, auth, categories, limit=10000, threshold=80):
        return client.post(
            "/api/v1/budgets",
            headers=auth,
            json={
                "name": "Groceries", "limit_amount": limit, "period_type": "monthly",
                "period_start": iso(START), "period_end": iso(END),
                "alert_threshold_pct": threshold, "scope": "shared",
                "category_id": str(categories["groceries"].id),
            },
        )

    def test_progress_tracks_actual_spending(self, client, auth, categories):
        self._budget(client, auth, categories, limit=10000)
        make_expense(client, auth, 4500, "Shop", str(categories["groceries"].id))
        row = client.get("/api/v1/budgets", headers=auth).json()[0]
        assert row["spent"] == 4500.0 and row["remaining"] == 5500.0 and row["used_pct"] == 45.0
        assert row["state"] == "on_track"

    def test_other_categories_do_not_count(self, client, auth, categories):
        self._budget(client, auth, categories, limit=10000)
        make_expense(client, auth, 4500, "Petrol", str(categories["transport"].id))
        assert client.get("/api/v1/budgets", headers=auth).json()[0]["spent"] == 0.0

    def test_warning_and_over_states(self, client, auth, categories):
        self._budget(client, auth, categories, limit=10000, threshold=80)
        make_expense(client, auth, 8500, "Shop", str(categories["groceries"].id))
        assert client.get("/api/v1/budgets", headers=auth).json()[0]["state"] == "warning"
        make_expense(client, auth, 2000, "More", str(categories["groceries"].id))
        row = client.get("/api/v1/budgets", headers=auth).json()[0]
        assert row["state"] == "over" and row["remaining"] == -500.0

    def test_overlapping_budget_for_a_category_is_rejected(self, client, auth, categories):
        assert self._budget(client, auth, categories).status_code == 201
        assert self._budget(client, auth, categories).status_code == 409

    def test_period_end_before_start_is_rejected(self, client, auth, categories):
        r = client.post(
            "/api/v1/budgets",
            headers=auth,
            json={
                "name": "Bad", "limit_amount": 100, "period_start": iso(END), "period_end": iso(START),
                "category_id": str(categories["groceries"].id),
            },
        )
        assert r.status_code == 422

    def test_overview_separates_budgeted_from_unbudgeted_spend(self, client, auth, categories):
        self._budget(client, auth, categories, limit=10000)
        make_expense(client, auth, 3000, "Shop", str(categories["groceries"].id))
        make_expense(client, auth, 1200, "Petrol", str(categories["transport"].id))
        o = client.get("/api/v1/budgets/overview", headers=auth).json()
        assert o["total_limit"] == 10000.0
        assert o["total_spent"] == 3000.0
        assert o["unbudgeted_spend"] == 1200.0

    def test_a_multi_month_budget_reports_only_this_months_spend(self, client, auth, categories):
        """A budget spanning months must not report its whole run as this month."""
        year_start = START.replace(month=1, day=1)
        year_end = START.replace(month=12, day=31)
        client.post(
            "/api/v1/budgets",
            headers=auth,
            json={
                "name": "Transport", "limit_amount": 90000, "period_type": "custom",
                "period_start": iso(year_start), "period_end": iso(year_end),
                "category_id": str(categories["transport"].id),
            },
        )
        for offset in (2, 1, 0):
            month = (START - timedelta(days=1)).replace(day=1) if offset else START
            day = iso(min(month.replace(day=10), TODAY)) if offset == 0 else iso(START - timedelta(days=20 * offset))
            client.post(
                "/api/v1/transactions",
                headers=auth,
                json={
                    "type": "expense", "amount": 3000, "title": "Fuel", "occurred_on": day,
                    "payment_method": "card", "scope": "shared", "category_id": str(categories["transport"].id),
                },
            )

        overview = client.get("/api/v1/budgets/overview", headers=auth).json()
        month_expenses = client.get("/api/v1/transactions/summary", headers=auth).json()["expenses"]
        assert overview["total_spent"] <= month_expenses

    def test_overlapping_budgets_do_not_double_count_the_same_spend(self, client, auth, auth_salini, categories):
        """A shared and a personal budget can cover one category.

        They track separately, but the money spent is the same money and must
        only be counted once in the headline figure.
        """
        body = {
            "name": "Groceries", "limit_amount": 5000, "period_start": iso(START),
            "period_end": iso(END), "category_id": str(categories["groceries"].id), "scope": "personal",
        }
        assert client.post("/api/v1/budgets", headers=auth_salini, json=body).status_code == 201
        assert client.post(
            "/api/v1/budgets", headers=auth, json={**body, "limit_amount": 8000, "scope": "shared"}
        ).status_code == 201

        make_expense(client, auth, 3000, "Shop", str(categories["groceries"].id))

        overview = client.get("/api/v1/budgets/overview", headers=auth_salini).json()
        assert overview["total_spent"] == 3000.0
        assert overview["total_limit"] == 8000.0
        assert overview["unbudgeted_spend"] == 0.0

    def test_rollover_carries_unspent_amount_forward(self, client, auth, categories):
        client.post(
            "/api/v1/budgets",
            headers=auth,
            json={
                "name": "Groceries", "limit_amount": 10000, "period_start": iso(START), "period_end": iso(END),
                "rollover": True, "category_id": str(categories["groceries"].id),
            },
        )
        make_expense(client, auth, 4000, "Shop", str(categories["groceries"].id))
        next_month = (END + timedelta(days=1))
        r = client.post(
            f"/api/v1/budgets/roll-forward?from_month={START:%Y-%m}&to_month={next_month:%Y-%m}", headers=auth
        )
        assert r.status_code == 200
        assert r.json()[0]["rollover_amount"] == 6000.0


class TestLoans:
    def _loan(self, client, auth, **kw):
        body = {
            "name": "Car EMI", "lender": "HDFC", "debt_type": "loan",
            "principal_amount": 650000, "outstanding_balance": 412500,
            "emi_amount": 9155, "interest_rate_annual": 9.1, "tenure_months": 84,
            "months_paid": 26, "due_day": 7, "next_due_date": iso(START.replace(day=7)),
            "status": "active", "scope": "shared",
        }
        body.update(kw)
        return client.post("/api/v1/loans", headers=auth, json=body)

    def test_outstanding_is_taken_as_given_not_derived(self, client, auth):
        loan = self._loan(client, auth).json()
        assert loan["outstanding_balance"] == 412500.0
        # EMI x remaining tenure would suggest a different number entirely.
        assert loan["emi_amount"] * (84 - 26) != loan["outstanding_balance"]

    def test_payment_reduces_the_outstanding_balance(self, client, auth):
        loan = self._loan(client, auth).json()
        r = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 9155, "paid_on": in_month(7), "payment_type": "emi"},
        )
        assert r.status_code == 201
        assert r.json()["outstanding_balance"] == 412500.0 - 9155.0
        assert r.json()["months_paid"] == 27

    def test_payment_with_interest_split_reduces_principal_only(self, client, auth):
        loan = self._loan(client, auth).json()
        r = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={
                "amount": 9155, "paid_on": in_month(7), "payment_type": "emi",
                "principal_component": 6030, "interest_component": 3125,
            },
        )
        assert r.json()["outstanding_balance"] == 412500.0 - 6030.0

    def test_payment_posts_a_matching_expense(self, client, auth):
        loan = self._loan(client, auth).json()
        client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 9155, "paid_on": in_month(7), "create_expense": True},
        )
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 9155.0

    def test_payment_can_skip_the_expense(self, client, auth):
        loan = self._loan(client, auth).json()
        client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 9155, "paid_on": in_month(7), "create_expense": False},
        )
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0

    def test_linked_expense_cannot_be_deleted_directly(self, client, auth):
        loan = self._loan(client, auth).json()
        client.post(
            f"/api/v1/loans/{loan['id']}/payments", headers=auth,
            json={"amount": 9155, "paid_on": in_month(7)},
        )
        txn = client.get("/api/v1/transactions", headers=auth).json()["items"][0]
        r = client.delete(f"/api/v1/transactions/{txn['id']}", headers=auth)
        assert r.status_code == 400

    def test_deleting_a_payment_reverses_balance_and_expense(self, client, auth):
        loan = self._loan(client, auth).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments", headers=auth,
            json={"amount": 9155, "paid_on": in_month(7)},
        ).json()
        payment_id = after["payments"][0]["id"]
        reverted = client.delete(f"/api/v1/loans/{loan['id']}/payments/{payment_id}", headers=auth).json()
        assert reverted["outstanding_balance"] == 412500.0
        assert reverted["months_paid"] == 26
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0

    def test_deleting_a_split_payment_restores_only_the_principal(self, client, auth):
        """A payment split into principal and interest only reduced principal.

        Reversing it must add back the principal, not the whole instalment.
        """
        loan = self._loan(client, auth).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={
                "amount": 9155, "paid_on": in_month(7), "payment_type": "emi",
                "principal_component": 6030, "interest_component": 3125,
            },
        ).json()
        assert after["outstanding_balance"] == 412500.0 - 6030.0

        payment_id = after["payments"][0]["id"]
        reverted = client.delete(f"/api/v1/loans/{loan['id']}/payments/{payment_id}", headers=auth).json()
        assert reverted["outstanding_balance"] == 412500.0

    def test_editing_a_split_payment_adjusts_by_principal(self, client, auth):
        loan = self._loan(client, auth).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={
                "amount": 9155, "paid_on": in_month(7), "payment_type": "emi",
                "principal_component": 6030, "interest_component": 3125,
            },
        ).json()
        payment_id = after["payments"][0]["id"]

        # Raising the instalment alone does not change the principal recorded,
        # so the balance must not move.
        edited = client.patch(
            f"/api/v1/loans/{loan['id']}/payments/{payment_id}", headers=auth, json={"amount": 9500}
        ).json()
        assert edited["outstanding_balance"] == 412500.0 - 6030.0

    def test_editing_a_charge_moves_the_balance_the_right_way(self, client, auth):
        card = self._loan(
            client, auth, name="Card", debt_type="credit_card", outstanding_balance=20000, emi_amount=5000
        ).json()
        after = client.post(
            f"/api/v1/loans/{card['id']}/payments",
            headers=auth,
            json={"amount": 3000, "paid_on": in_month(7), "payment_type": "charge", "create_expense": False},
        ).json()
        assert after["outstanding_balance"] == 23000.0

        payment_id = after["payments"][0]["id"]
        # Correcting the charge down to 1000 must lower the balance, not raise it.
        edited = client.patch(
            f"/api/v1/loans/{card['id']}/payments/{payment_id}", headers=auth, json={"amount": 1000}
        ).json()
        assert edited["outstanding_balance"] == 21000.0

    def test_reversing_a_payment_reopens_a_closed_loan(self, client, auth):
        loan = self._loan(client, auth, outstanding_balance=9155).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments", headers=auth,
            json={"amount": 9155, "paid_on": in_month(7)},
        ).json()
        assert after["status"] == "closed"

        payment_id = after["payments"][0]["id"]
        reverted = client.delete(f"/api/v1/loans/{loan['id']}/payments/{payment_id}", headers=auth).json()
        assert reverted["status"] == "active"
        assert reverted["outstanding_balance"] == 9155.0
        assert reverted["next_due_date"] is not None

    def test_overpayment_reverses_to_the_right_balance(self, client, auth):
        """Paying more than is owed must not inflate the balance when reversed.

        A final instalment often exceeds the remaining principal, so it is
        allowed; only the part that cleared the balance is restored.
        """
        loan = self._loan(client, auth, outstanding_balance=500, emi_amount=0).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 1000, "paid_on": in_month(7), "payment_type": "extra", "create_expense": False},
        ).json()
        assert after["outstanding_balance"] == 0.0

        payment_id = after["payments"][0]["id"]
        reverted = client.delete(f"/api/v1/loans/{loan['id']}/payments/{payment_id}", headers=auth).json()
        assert reverted["outstanding_balance"] == 500.0

    def test_correcting_an_overpayment_lands_on_the_right_balance(self, client, auth):
        loan = self._loan(client, auth, outstanding_balance=500, emi_amount=0).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 1000, "paid_on": in_month(7), "payment_type": "extra", "create_expense": False},
        ).json()
        payment_id = after["payments"][0]["id"]
        corrected = client.patch(
            f"/api/v1/loans/{loan['id']}/payments/{payment_id}", headers=auth, json={"amount": 100}
        ).json()
        assert corrected["outstanding_balance"] == 400.0
        assert corrected["status"] == "active"

    def test_restoring_a_balance_reopens_a_closed_debt(self, client, auth):
        """A balance corrected upwards must rejoin the outstanding total."""
        loan = self._loan(client, auth, outstanding_balance=0, status="closed", emi_amount=0).json()
        updated = client.patch(
            f"/api/v1/loans/{loan['id']}", headers=auth, json={"outstanding_balance": 20000}
        ).json()
        assert updated["status"] == "active"
        assert client.get("/api/v1/loans/summary", headers=auth).json()["total_outstanding"] == 20000.0
        assert client.get("/api/v1/dashboard", headers=auth).json()["total_outstanding_debt"] == 20000.0

    def test_an_explicit_status_is_not_overridden(self, client, auth):
        loan = self._loan(client, auth, outstanding_balance=20000).json()
        updated = client.patch(f"/api/v1/loans/{loan['id']}", headers=auth, json={"status": "paused"}).json()
        assert updated["status"] == "paused"

    def test_a_paused_debt_paid_off_is_closed(self, client, auth):
        loan = self._loan(client, auth, outstanding_balance=1000, status="paused", emi_amount=0).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 1000, "paid_on": in_month(7), "payment_type": "extra", "create_expense": False},
        ).json()
        assert after["status"] == "closed"
        summary = client.get("/api/v1/loans/summary", headers=auth).json()
        assert summary["closed_count"] == 1

    def test_a_card_charge_does_not_double_count_the_spending(self, client, auth):
        """The charge and the repayment are the same money leaving the household."""
        card = self._loan(
            client, auth, name="Card", debt_type="credit_card", outstanding_balance=0, emi_amount=0
        ).json()
        client.post(
            f"/api/v1/loans/{card['id']}/payments",
            headers=auth,
            json={"amount": 5000, "paid_on": in_month(5), "payment_type": "charge"},
        )
        client.post(
            f"/api/v1/loans/{card['id']}/payments",
            headers=auth,
            json={"amount": 5000, "paid_on": in_month(20), "payment_type": "extra"},
        )
        summary = client.get(f"/api/v1/transactions/summary?month={START:%Y-%m}", headers=auth).json()
        assert summary["expenses"] == 5000.0
        assert summary["expense_count"] == 1

    def test_extra_payment_shortens_the_estimate(self, client, auth):
        loan = self._loan(client, auth).json()
        before = client.get(f"/api/v1/loans/{loan['id']}", headers=auth).json()["remaining_months_estimate"]
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 100000, "paid_on": in_month(7), "payment_type": "extra"},
        ).json()
        assert after["remaining_months_estimate"] < before

    def test_clearing_the_balance_closes_the_loan(self, client, auth):
        loan = self._loan(client, auth, outstanding_balance=9155).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments", headers=auth,
            json={"amount": 9155, "paid_on": in_month(7)},
        ).json()
        assert after["outstanding_balance"] == 0.0
        assert after["status"] == "closed"
        assert after["next_due_date"] is None

    def test_credit_card_charge_increases_the_balance(self, client, auth):
        card = self._loan(
            client, auth, name="Card", debt_type="credit_card", outstanding_balance=18420, emi_amount=10000
        ).json()
        after = client.post(
            f"/api/v1/loans/{card['id']}/payments",
            headers=auth,
            json={"amount": 2000, "paid_on": in_month(7), "payment_type": "charge", "create_expense": False},
        ).json()
        assert after["outstanding_balance"] == 20420.0

    def test_changing_a_payment_type_keeps_cash_flow_in_step(self, client, auth):
        """A charge posts no expense; a real payment does. Editing must follow."""
        card = self._loan(
            client, auth, name="Card", debt_type="credit_card", outstanding_balance=10000, emi_amount=0
        ).json()
        after = client.post(
            f"/api/v1/loans/{card['id']}/payments",
            headers=auth,
            json={"amount": 2000, "paid_on": in_month(7), "payment_type": "charge"},
        ).json()
        payment_id = after["payments"][0]["id"]
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0

        client.patch(
            f"/api/v1/loans/{card['id']}/payments/{payment_id}", headers=auth, json={"payment_type": "extra"}
        )
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 2000.0

        client.patch(
            f"/api/v1/loans/{card['id']}/payments/{payment_id}", headers=auth, json={"payment_type": "charge"}
        )
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0

    def test_removing_a_payment_removes_its_entry_for_good(self, client, auth):
        """The entry exists only because the payment does; it must not linger."""
        loan = self._loan(client, auth, outstanding_balance=10000, emi_amount=1000).json()
        after = client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 1000, "paid_on": in_month(7), "payment_type": "emi"},
        ).json()
        txn_id = client.get("/api/v1/transactions", headers=auth).json()["items"][0]["id"]

        client.delete(f"/api/v1/loans/{loan['id']}/payments/{after['payments'][0]['id']}", headers=auth)
        assert client.post(f"/api/v1/transactions/{txn_id}/restore", headers=auth).status_code == 404
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0

    def test_summary_sums_active_debts_only(self, client, auth):
        self._loan(client, auth)
        self._loan(client, auth, name="Closed one", outstanding_balance=0, status="closed", emi_amount=5000)
        s = client.get("/api/v1/loans/summary", headers=auth).json()
        assert s["total_outstanding"] == 412500.0
        assert s["monthly_emi_commitment"] == 9155.0
        assert s["active_count"] == 1 and s["closed_count"] == 1

    def test_debt_type_filter(self, client, auth):
        self._loan(client, auth)
        self._loan(client, auth, name="BNPL", debt_type="bnpl")
        assert len(client.get("/api/v1/loans?debt_type=bnpl", headers=auth).json()) == 1


class TestSettlements:
    def _settlement(self, client, auth, **kw):
        body = {"person_name": "Stephen", "direction": "we_owe", "total_amount": 1750, "scope": "shared"}
        body.update(kw)
        return client.post("/api/v1/settlements", headers=auth, json=body)

    def test_partial_payment_updates_status_and_remainder(self, client, auth):
        s = self._settlement(client, auth, total_amount=10000).json()
        after = client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 2500, "paid_on": in_month(5), "create_expense": False},
        ).json()
        assert after["status"] == "partial"
        assert after["paid_amount"] == 2500.0 and after["remaining_amount"] == 7500.0

    def test_full_payment_settles(self, client, auth):
        s = self._settlement(client, auth).json()
        after = client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 1750, "paid_on": in_month(5), "create_expense": False},
        ).json()
        assert after["status"] == "settled" and after["remaining_amount"] == 0.0

    def test_overpayment_is_rejected(self, client, auth):
        s = self._settlement(client, auth).json()
        r = client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 5000, "paid_on": in_month(5)},
        )
        assert r.status_code == 400

    def test_money_we_owe_posts_an_expense(self, client, auth):
        s = self._settlement(client, auth).json()
        client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 1750, "paid_on": in_month(5), "create_expense": True},
        )
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 1750.0

    def test_money_owed_to_us_posts_income(self, client, auth):
        s = self._settlement(client, auth, direction="owed_to_us", person_name="Arun", total_amount=4500).json()
        client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 4500, "paid_on": in_month(5), "create_expense": True},
        )
        assert client.get("/api/v1/dashboard", headers=auth).json()["income"] == 4500.0

    def test_summary_nets_both_directions(self, client, auth):
        self._settlement(client, auth, total_amount=1750)
        self._settlement(client, auth, person_name="Jilsha", total_amount=3000)
        self._settlement(client, auth, person_name="Arun", direction="owed_to_us", total_amount=4500)
        s = client.get("/api/v1/settlements/summary", headers=auth).json()
        assert s["we_owe_total"] == 4750.0
        assert s["owed_to_us_total"] == 4500.0
        assert s["net_position"] == -250.0

    def test_summary_excludes_amounts_already_paid(self, client, auth):
        s = self._settlement(client, auth, total_amount=10000).json()
        client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 4000, "paid_on": in_month(5), "create_expense": False},
        )
        assert client.get("/api/v1/settlements/summary", headers=auth).json()["we_owe_total"] == 6000.0

    def test_total_cannot_drop_below_what_is_already_paid(self, client, auth):
        s = self._settlement(client, auth, total_amount=1000).json()
        client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 1000, "paid_on": in_month(5), "create_expense": False},
        )
        r = client.patch(f"/api/v1/settlements/{s['id']}", headers=auth, json={"total_amount": 400})
        assert r.status_code == 400
        assert "already been recorded" in r.json()["detail"]

    def test_deleting_a_payment_reopens_the_settlement(self, client, auth):
        s = self._settlement(client, auth).json()
        after = client.post(
            f"/api/v1/settlements/{s['id']}/payments",
            headers=auth,
            json={"amount": 1750, "paid_on": in_month(5), "create_expense": True},
        ).json()
        payment_id = after["payments"][0]["id"]
        reverted = client.delete(f"/api/v1/settlements/{s['id']}/payments/{payment_id}", headers=auth).json()
        assert reverted["status"] == "pending" and reverted["remaining_amount"] == 1750.0
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 0.0


class TestRecurring:
    def _rule(self, client, auth, categories, **kw):
        body = {
            "title": "House Rent", "type": "expense", "amount": 18000, "frequency": "monthly",
            "day_of_month": 5, "start_date": iso(START), "payment_method": "bank", "scope": "shared",
            "category_id": str(categories["groceries"].id),
        }
        body.update(kw)
        return client.post("/api/v1/recurring", headers=auth, json=body)

    def test_posting_creates_a_transaction_and_advances_the_schedule(self, client, auth, categories):
        rule = self._rule(client, auth, categories).json()
        first_run = rule["next_run_on"]
        posted = client.post(f"/api/v1/recurring/{rule['id']}/post", headers=auth).json()
        assert posted["amount"] == 18000.0
        updated = client.get("/api/v1/recurring", headers=auth).json()[0]
        assert updated["next_run_on"] > first_run

    def test_auto_post_due_is_not_double_counted(self, client, auth, categories):
        self._rule(client, auth, categories, auto_post=True, start_date=iso(START))
        first = client.post("/api/v1/recurring/post-due", headers=auth).json()
        second = client.post("/api/v1/recurring/post-due", headers=auth).json()
        assert len(first) >= 1
        assert second == []

    def test_upcoming_payments_include_recurring_expenses(self, client, auth, categories):
        future = TODAY + timedelta(days=10)
        self._rule(client, auth, categories, day_of_month=future.day, start_date=iso(TODAY))
        titles = [u["title"] for u in client.get("/api/v1/dashboard", headers=auth).json()["upcoming_payments"]]
        assert "House Rent" in titles


class TestForecast:
    def test_projection_is_labelled_as_an_estimate(self, client, auth):
        f = client.post("/api/v1/forecast", headers=auth, json={"horizon_months": 3}).json()
        assert "not a live bank balance" in f["disclaimer"]
        assert all(m["is_estimate"] for m in f["months"])

    def test_horizon_controls_month_count(self, client, auth):
        for horizon in (1, 3, 6, 12):
            f = client.post("/api/v1/forecast", headers=auth, json={"horizon_months": horizon}).json()
            assert len(f["months"]) == horizon

    def test_emi_is_projected_separately_from_average_expenses(self, client, auth, categories):
        """Historical EMI must not be counted twice in the projection.

        The EMI is recorded as a loan payment, which posts its own linked
        expense. That link is what excludes it from the expense average.
        """
        loan = client.post(
            "/api/v1/loans",
            headers=auth,
            json={
                "name": "Car EMI", "debt_type": "loan", "principal_amount": 500000,
                "outstanding_balance": 100000, "emi_amount": 10000, "tenure_months": 60,
                "due_day": 5, "next_due_date": iso(START.replace(day=5)),
                "category_id": str(categories["emi"].id), "scope": "shared",
            },
        ).json()
        last_month = (START - timedelta(days=1)).replace(day=5)
        client.post(
            f"/api/v1/loans/{loan['id']}/payments",
            headers=auth,
            json={"amount": 10000, "paid_on": iso(last_month), "payment_type": "emi"},
        )
        client.post(
            "/api/v1/transactions",
            headers=auth,
            json={
                "type": "expense", "amount": 15000, "title": "Groceries",
                "occurred_on": iso(last_month), "payment_method": "upi", "scope": "shared",
                "category_id": str(categories["groceries"].id),
            },
        )
        f = client.post("/api/v1/forecast", headers=auth, json={"horizon_months": 3}).json()
        assert f["baseline_monthly_expense"] == 5000.0  # 15000 over three months
        assert f["baseline_monthly_emi"] == 10000.0

    def test_emi_stops_once_a_loan_is_projected_to_close(self, client, auth, categories):
        client.post(
            "/api/v1/loans",
            headers=auth,
            json={
                "name": "Short loan", "debt_type": "loan", "principal_amount": 30000,
                "outstanding_balance": 20000, "emi_amount": 10000, "due_day": 5,
                "next_due_date": iso(START.replace(day=5)), "scope": "shared",
            },
        )
        f = client.post("/api/v1/forecast", headers=auth, json={"horizon_months": 3}).json()
        emis = [m["projected_emi"] for m in f["months"]]
        assert emis[0] == 10000.0 and emis[1] == 10000.0
        assert emis[2] == 0.0
        assert "Short loan" in f["months"][1]["loans_closing_this_month"]

    def test_unsupported_horizon_is_rejected(self, client, auth):
        assert client.post("/api/v1/forecast", headers=auth, json={"horizon_months": 4}).status_code == 422

    def test_income_adjustment_raises_the_projection(self, client, auth):
        base = client.post("/api/v1/forecast", headers=auth, json={"horizon_months": 6}).json()
        raised = client.post(
            "/api/v1/forecast",
            headers=auth,
            json={
                "horizon_months": 6,
                "adjustments": [{"kind": "income_delta", "label": "Raise", "amount": 10000}],
            },
        ).json()
        assert raised["projected_end_balance"] - base["projected_end_balance"] == 60000.0

    def test_one_off_applies_only_inside_its_window(self, client, auth):
        base = client.post("/api/v1/forecast", headers=auth, json={"horizon_months": 6}).json()
        target = base["months"][1]["month_start"]
        with_trip = client.post(
            "/api/v1/forecast",
            headers=auth,
            json={
                "horizon_months": 6,
                "adjustments": [
                    {"kind": "one_off", "label": "Trip", "amount": 40000,
                     "starts_on": target, "ends_on": target},
                ],
            },
        ).json()
        assert base["projected_end_balance"] - with_trip["projected_end_balance"] == 40000.0

    def test_overrides_replace_the_derived_baseline(self, client, auth):
        f = client.post(
            "/api/v1/forecast",
            headers=auth,
            json={"horizon_months": 1, "monthly_income_override": 80000, "monthly_expense_override": 30000},
        ).json()
        assert f["baseline_monthly_income"] == 80000.0
        assert f["months"][0]["projected_savings"] == 50000.0

    def test_scenario_round_trip_and_comparison(self, client, auth):
        created = client.post(
            "/api/v1/forecast/scenarios",
            headers=auth,
            json={
                "name": "After raise", "horizon_months": 6,
                "adjustments": [{"kind": "income_delta", "label": "Raise", "amount": 5000}],
            },
        )
        assert created.status_code == 201
        comparison = client.get(
            f"/api/v1/forecast/scenarios/{created.json()['id']}/compare", headers=auth
        ).json()
        assert comparison["end_balance_delta"] == 30000.0


class TestImportExport:
    CSV = (
        b"date,type,title,amount,category,payment_method,scope,notes\n"
        b"2026-09-15,expense,Lunch,250,Dining,cash,shared,team lunch\n"
        b"15/09/2026,expense,Fuel,1200,Transport,card,shared,\n"
        b"not-a-date,expense,Broken,500,Dining,cash,shared,\n"
        b"2026-09-16,expense,Bad amount,abc,Dining,cash,shared,\n"
    )

    def test_preview_reports_valid_and_invalid_rows_without_saving(self, client, auth):
        r = client.post(
            "/api/v1/transactions/import/preview", headers=auth, files={"file": ("t.csv", self.CSV, "text/csv")}
        ).json()
        assert r["valid_count"] == 2 and r["error_count"] == 2
        assert client.get("/api/v1/transactions", headers=auth).json()["total"] == 0

    def test_import_saves_valid_rows_and_creates_categories(self, client, auth):
        r = client.post(
            "/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", self.CSV, "text/csv")}
        ).json()
        assert r["imported"] == 2 and r["skipped"] == 2
        names = [c["name"] for c in client.get("/api/v1/categories", headers=auth).json()]
        assert "Dining" in names and "Transport" in names

    def test_import_can_be_undone_as_a_batch(self, client, auth):
        batch = client.post(
            "/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", self.CSV, "text/csv")}
        ).json()["batch_id"]
        client.delete(f"/api/v1/transactions/import/{batch}", headers=auth)
        assert client.get("/api/v1/transactions", headers=auth).json()["total"] == 0

    def test_undo_import_cannot_reach_another_members_private_rows(self, client, auth, auth_salini):
        """An import id must not be a way around record visibility."""
        private = (
            b"date,type,title,amount,category,payment_method,scope,notes\n"
            b"2026-09-15,expense,Private,250,Dining,cash,personal,\n"
        )
        batch = client.post(
            "/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", private, "text/csv")}
        ).json()["batch_id"]

        client.delete(f"/api/v1/transactions/import/{batch}", headers=auth_salini)
        assert client.get("/api/v1/transactions", headers=auth).json()["total"] == 1

    def test_import_does_not_attach_another_members_private_category(self, client, auth, auth_salini):
        client.post(
            "/api/v1/categories",
            headers=auth_salini,
            json={"name": "Therapy", "kind": "expense", "is_personal": True},
        )
        csv = (
            b"date,type,title,amount,category,payment_method,scope,notes\n"
            b"2026-09-15,expense,Session,900,Therapy,cash,shared,\n"
        )
        client.post("/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", csv, "text/csv")})

        row = client.get("/api/v1/transactions", headers=auth).json()["items"][0]
        visible = {c["name"] for c in client.get("/api/v1/categories", headers=auth).json()}
        assert row["category"] is None or row["category"]["name"] in visible

    def test_an_imported_income_category_is_created_as_income(self, client, auth):
        csv = (
            b"date,type,title,amount,category,payment_method,scope,notes\n"
            b"2026-09-15,income,Bonus,5000,Bonus Pay,bank,shared,\n"
        )
        client.post("/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", csv, "text/csv")})
        row = client.get("/api/v1/transactions", headers=auth).json()["items"][0]
        assert row["category"]["kind"] == "income"
        # The category must remain usable when the entry is edited later.
        r = client.patch(
            f"/api/v1/transactions/{row['id']}", headers=auth, json={"category_id": row["category_id"]}
        )
        assert r.status_code == 200

    def test_imported_rows_stay_editable(self, client, auth):
        client.post("/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", self.CSV, "text/csv")})
        row = client.get("/api/v1/transactions", headers=auth).json()["items"][0]
        r = client.patch(f"/api/v1/transactions/{row['id']}", headers=auth, json={"amount": 999})
        assert r.status_code == 200 and r.json()["amount"] == 999.0

    def test_empty_upload_is_rejected(self, client, auth):
        r = client.post("/api/v1/transactions/import", headers=auth, files={"file": ("t.csv", b"", "text/csv")})
        assert r.status_code == 400

    def test_csv_and_excel_export(self, client, auth):
        make_expense(client, auth, 500, "Exported row")
        csv_response = client.get("/api/v1/transactions/export/file?format=csv", headers=auth)
        assert csv_response.status_code == 200 and b"Exported row" in csv_response.content
        xlsx_response = client.get("/api/v1/transactions/export/file?format=xlsx", headers=auth)
        assert xlsx_response.status_code == 200 and xlsx_response.content[:2] == b"PK"


class TestCategories:
    def test_duplicate_name_rejected(self, client, auth, categories):
        r = client.post("/api/v1/categories", headers=auth, json={"name": "groceries", "kind": "expense"})
        assert r.status_code == 409

    def test_personal_category_hidden_from_the_other_member(self, client, auth, auth_salini):
        client.post("/api/v1/categories", headers=auth, json={"name": "My hobby", "kind": "expense", "is_personal": True})
        mine = [c["name"] for c in client.get("/api/v1/categories", headers=auth).json()]
        theirs = [c["name"] for c in client.get("/api/v1/categories", headers=auth_salini).json()]
        assert "My hobby" in mine and "My hobby" not in theirs

    def test_deleting_a_category_leaves_transactions_intact(self, client, auth, categories):
        created = make_expense(client, auth, 500, "Shop", str(categories["groceries"].id)).json()
        client.delete(f"/api/v1/categories/{categories['groceries'].id}", headers=auth)
        row = client.get(f"/api/v1/transactions/{created['id']}", headers=auth).json()
        assert row["amount"] == 500.0
        assert client.get("/api/v1/dashboard", headers=auth).json()["expenses"] == 500.0


class TestDashboardShape:
    def test_all_sections_present(self, client, auth):
        d = client.get("/api/v1/dashboard", headers=auth).json()
        for key in (
            "greeting_name", "period_label", "available_balance", "income", "expenses",
            "upcoming_commitments", "cash_flow", "upcoming_payments", "spending_by_category",
            "recent_transactions", "total_outstanding_debt", "monthly_emi_commitment",
            "we_owe_total", "owed_to_us_total", "budget_limit", "is_demo_data",
        ):
            assert key in d

    def test_empty_account_returns_zeroes_not_errors(self, client, auth):
        d = client.get("/api/v1/dashboard", headers=auth).json()
        assert d["available_balance"] == 0.0 and d["income"] == 0.0 and d["expenses"] == 0.0
        assert d["is_demo_data"] is False

    def test_an_impossible_month_is_rejected_not_crashed(self, client, auth):
        for path in ("/api/v1/transactions/summary", "/api/v1/dashboard", "/api/v1/budgets/overview"):
            assert client.get(f"{path}?month=2026-13", headers=auth).status_code == 422
            assert client.get(f"{path}?month=2026-00", headers=auth).status_code == 422

    def test_cash_flow_covers_every_day_of_the_month(self, client, auth):
        d = client.get("/api/v1/dashboard", headers=auth).json()
        assert len(d["cash_flow"]) == END.day

    def test_longer_ranges_switch_to_monthly_points(self, client, auth):
        d = client.get("/api/v1/dashboard?range=6m", headers=auth).json()
        assert len(d["cash_flow"]) == 6
