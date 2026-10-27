"""platform: outbox, idempotency, audit, login attempts, job runs, DLQ

Revision ID: 0008_platform
Revises: 0007_combat
Create Date: 2026-10-25
"""

from __future__ import annotations

from datetime import date

from alembic import op

revision = "0008_platform"
down_revision = "0007_combat"
branch_labels = None
depends_on = None

TABLES = "idempotency_keys, audit_log, login_attempts, job_runs, dlq_events, feature_flags"
OUTBOX_MONTHS = 3
AUDIT_MONTHS = 4


def _months(first: date, count: int) -> list[date]:
    result: list[date] = []
    year, month = first.year, first.month
    for _ in range(count):
        result.append(date(year, month, 1))
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return result


def _partition_statements(table: str, first: date, count: int) -> str:
    statements: list[str] = []
    for month in _months(first, count):
        nxt = (month.year + 1, 1) if month.month == 12 else (month.year, month.month + 1)
        name = f"{table}_{month:%Y_%m}"
        statements.append(
            f"CREATE TABLE IF NOT EXISTS {name} PARTITION OF {table} "
            f"FOR VALUES FROM ('{month:%Y-%m-%d}') TO ('{nxt[0]:04d}-{nxt[1]:02d}-01');"
        )
    return "\n".join(statements)


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE outbox_events (
  id bigserial,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retry_count smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX outbox_pending_idx ON outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  route text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  status smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idempotency_created_idx ON idempotency_keys (created_at);

CREATE TABLE audit_log (
  id bigserial,
  actor uuid,
  action text NOT NULL,
  target text,
  before jsonb,
  after jsonb,
  ip inet,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX audit_actor_idx ON audit_log (actor, created_at DESC);

CREATE TABLE login_attempts (
  id bigserial PRIMARY KEY,
  identifier text NOT NULL,
  ip inet,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_identifier_idx ON login_attempts (identifier, created_at DESC);

CREATE TABLE job_runs (
  job_name text NOT NULL,
  run_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  detail jsonb,
  PRIMARY KEY (job_name, run_date)
);

CREATE TABLE dlq_events (
  id bigserial PRIMARY KEY,
  task text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  replayed_at timestamptz
);

CREATE TABLE feature_flags (
  name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
"""
    )
    today = date.today()
    outbox_start = date(today.year, today.month, 1)
    op.execute(_partition_statements("outbox_events", outbox_start, OUTBOX_MONTHS))
    op.execute(_partition_statements("audit_log", outbox_start, AUDIT_MONTHS))
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON {TABLES} TO atlas_app;
    GRANT SELECT, INSERT ON outbox_events TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE outbox_events_id_seq, audit_log_id_seq TO atlas_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON idempotency_keys, audit_log, login_attempts, job_runs, dlq_events, feature_flags, outbox_events TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS feature_flags")
    op.execute("DROP TABLE IF EXISTS dlq_events")
    op.execute("DROP TABLE IF EXISTS job_runs")
    op.execute("DROP TABLE IF EXISTS login_attempts")
    op.execute("DROP TABLE IF EXISTS audit_log CASCADE")
    op.execute("DROP TABLE IF EXISTS idempotency_keys")
    op.execute("DROP TABLE IF EXISTS outbox_events CASCADE")
