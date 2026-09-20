# Finman API.
#
# Runs migrations and seeds the two accounts on every boot, both of which are
# idempotent, then serves the app. Safe to restart at any time.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so a code change does not reinstall them.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x ./start.sh

# Render supplies PORT; this is the local default.
ENV PORT=8000
EXPOSE 8000

CMD ["./start.sh"]
