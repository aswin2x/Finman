#!/usr/bin/env bash
# Boot sequence for the hosted API.
#
# Both steps are idempotent, so a restart or redeploy never loses data:
# migrations only apply what is missing, and the seed only creates the two
# accounts and the default categories if they are not already there.
set -euo pipefail

echo "Applying database migrations..."
python -m alembic upgrade head

echo "Ensuring the two accounts and default categories exist..."
python -m app.seed

echo "Starting Finman API on port ${PORT:-8000}"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-1}"
