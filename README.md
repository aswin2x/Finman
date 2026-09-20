# Finman

A private expense, budget, loan and settlement tracker for a two-person
household. Dark-first mobile app, FastAPI backend, PostgreSQL.

```
finman/
├── backend/          FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── core/     settings, database, security, dependencies
│   │   ├── models/   SQLAlchemy tables
│   │   ├── schemas/  Pydantic request and response contracts
│   │   ├── routers/  HTTP endpoints
│   │   └── services/ financial calculations and aggregations
│   └── tests/        108 tests covering the money maths
└── mobile/           Expo + React Native + TypeScript
    ├── app/          Expo Router screens
    └── src/
        ├── theme/    design tokens (the only place colours are defined)
        ├── lib/      API client, React Query hooks, formatting
        └── components/
```

## Running it

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

cp .env.example .env        # then edit it
python -m alembic upgrade head
python -m app.seed          # creates the two users and default categories
python -m app.seed --demo   # optional: adds clearly-tagged sample data

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs: `http://localhost:8000/docs`

Bind to `0.0.0.0` so a phone on the same network can reach it.

### Mobile

```bash
cd mobile
npm install
npm start          # then scan the QR code with Expo Go
```

The app finds the backend automatically from the Metro host. To point it
somewhere else, set `EXPO_PUBLIC_API_URL`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000 npm start
```

### Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q
```

## Accounts

Two accounts exist and no more can be registered through the API. Usernames,
display names and initial passwords come from the backend settings:

| Setting | Default |
| --- | --- |
| `USER_ONE_USERNAME` / `USER_ONE_PASSWORD` | `aswin` / `aswin1234` |
| `USER_TWO_USERNAME` / `USER_TWO_PASSWORD` | `salini` / `salini1234` |

Change these in `.env` before seeding, or change the password in the app under
Settings. Every other session is signed out when a password changes.

## How the money works

A few rules are enforced in the backend rather than left to the interface.

**Shared and personal.** Every record carries a scope. `shared` records are
visible to both members; `personal` records only to whoever recorded them.
Both members can edit shared records, since it is one household ledger.

**The outstanding balance is recorded, not derived.** A loan's outstanding
balance is entered and maintained directly, and reduced by the payments you
record. It is never computed as EMI times remaining tenure, because interest
and extra payments pull those two figures apart. Where an EMI is too small to
ever clear a balance, the app says so instead of inventing a completion date.

**Payments create matching entries.** Recording a loan EMI or a settlement
payment also posts a transaction, so cash flow reflects money that actually
moved. Those entries are linked and cannot be deleted on their own; removing
the payment removes them and restores the balance.

**Projections are labelled.** The forecast separates the actual cash position
from every projected figure. EMI is projected from live loan balances and
excluded from the historical expense average, so a commitment is never counted
twice. Nothing in the app claims to be a synced bank balance.

**Available balance** is the cash position implied by your records: everything
recorded before the period, plus this period's income, minus its expenses.

## Demo data

`python -m app.seed --demo` loads a coherent month of household activity for
evaluating the interface. Every row is tagged `demo-seed`, the dashboard
reports `is_demo_data` and shows a banner, and `python -m app.seed --clear-demo`
removes it. Production data never carries the tag.

## Import and export

CSV and Excel both work, in either direction. Import is two-step: a preview
reports how many rows will land and which will be skipped and why, and only
then is anything written. Each import is tagged with a batch id so the whole
thing can be undone in one action. Unknown category names are created rather
than dropped.

Expected columns:

```
date, type, title, amount, category, payment_method, scope, notes
```

Dates are accepted in several formats (`2026-09-15`, `15/09/2026`,
`15 Sep 2026`). Amounts tolerate currency symbols, commas and brackets.

## Accessibility and motion

Every animation is skipped when the operating system reports "reduce motion":
entrances become instant and counting numbers jump to their final value.
Nothing is hidden, only the movement. Interactive elements carry labels and
roles, progress bars report their value, and colour is never the only signal
for a state.
