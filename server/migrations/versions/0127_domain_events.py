"""append-only domain event log

Revision ID: 0127_domain_events
Revises: 0126_split_cold
Create Date: 2026-10-28

Design reference: docs/architecture/module-dependencies.md §5（同步调用 + 事件）

Scope
-----
``domain_events`` is the *transactional* half of the event bus: a producer
inserts the row in the same transaction as the state change, so "state says X" and
"event says X" can never disagree. Delivery is a separate concern and is not in
this migration.

Columns:
* ``seq``       monotonic cursor for consumers (``WHERE seq > %s ORDER BY seq``);
* ``type``      dotted name, e.g. ``stock.split`` / ``court.judgment``;
* ``aggregate`` stable reference (ticker, case id) — never a row pointer;
* ``payload``   jsonb, small: ids and amounts, not whole objects;
* ``actor_id``  who caused it, nullable for system jobs.
"""

from __future__ import annotations

from alembic import op

revision = "0127_domain_events"
down_revision = "0126_split_cold"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE domain_events (
  seq bigserial PRIMARY KEY,
  type text NOT NULL,
  aggregate text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_event_type_idx ON domain_events (type, seq DESC);
CREATE INDEX domain_event_aggregate_idx ON domain_events (aggregate, seq DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON domain_events TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE domain_events_seq_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON domain_events TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS domain_events")
