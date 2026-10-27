"""cross-region 2PC: distributed transactions, participants, decisions, outbox

Revision ID: 0115_cross_region_2pc
Revises: 0114_company_law_court
Create Date: 2026-10-27

Design references: docs/cosmic-economy/09 §2.1/§3/§4/§7A/§13.

Scope
-----
* the coordinator's transaction log (``distributed_transactions``) plus
  participants, append-only decisions, the outbox and the lease table;
* ``dt_config`` holds the unknown-SLA knobs so ops can tune them without a
  deploy (09 §3.5);
* in the single-database stage a transaction is a one-participant no-op: the
  coordinator records the log and commits immediately. Nothing in the business
  layer changes when regions are split for real.
"""

from __future__ import annotations

from alembic import op

revision = "0115_cross_region_2pc"
down_revision = "0114_company_law_court"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE distributed_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'init'
    CHECK (status IN ('init','preparing','prepared','committing','committed',
                      'aborting','aborted','unknown')),
  coordinator_id text NOT NULL DEFAULT '',
  coordinator_region text NOT NULL DEFAULT 'core',
  origin_region text NOT NULL DEFAULT 'core',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notional numeric(30,4) NOT NULL DEFAULT 0 CHECK (notional >= 0),
  currency_code text REFERENCES currencies(code),
  fee_bps integer NOT NULL DEFAULT 0 CHECK (fee_bps BETWEEN 0 AND 30),
  fee_amount numeric(30,4) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  idempotency_key text UNIQUE,
  retries integer NOT NULL DEFAULT 0,
  deadline_at timestamptz NOT NULL,
  unknown_since timestamptz,
  decided_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dt_status_idx ON distributed_transactions (status, deadline_at);
CREATE INDEX dt_origin_idx ON distributed_transactions (origin_region, created_at DESC);

CREATE TABLE dt_participants (
  tx_id uuid NOT NULL REFERENCES distributed_transactions(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  region text NOT NULL DEFAULT 'core',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','prepared','committed','aborted','failed')),
  attempts integer NOT NULL DEFAULT 0,
  prepared_at timestamptz,
  committed_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  PRIMARY KEY (tx_id, participant_id)
);

CREATE TABLE dt_decisions (
  id bigserial PRIMARY KEY,
  tx_id uuid NOT NULL REFERENCES distributed_transactions(id) ON DELETE CASCADE,
  decision text NOT NULL
    CHECK (decision IN ('commit','abort','heuristic_commit','heuristic_abort')),
  reason text NOT NULL DEFAULT '',
  decided_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dt_decision_tx_idx ON dt_decisions (tx_id, id);

CREATE TABLE dt_outbox (
  id bigserial PRIMARY KEY,
  tx_id uuid NOT NULL REFERENCES distributed_transactions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dt_outbox_pending_idx ON dt_outbox (published_at, id);

CREATE TABLE dt_coordinator_lease (
  tx_id uuid PRIMARY KEY REFERENCES distributed_transactions(id) ON DELETE CASCADE,
  coordinator_id text NOT NULL,
  region text NOT NULL DEFAULT 'core',
  lease_until timestamptz NOT NULL
);
CREATE INDEX dt_lease_expiry_idx ON dt_coordinator_lease (lease_until);

CREATE TABLE dt_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  budget_ms integer NOT NULL DEFAULT 5000 CHECK (budget_ms > 0),
  prepare_ms integer NOT NULL DEFAULT 2000 CHECK (prepare_ms > 0),
  commit_ms integer NOT NULL DEFAULT 2000 CHECK (commit_ms > 0),
  lease_seconds integer NOT NULL DEFAULT 3 CHECK (lease_seconds > 0),
  unknown_after_ms integer NOT NULL DEFAULT 8000 CHECK (unknown_after_ms > 0),
  freeze_after_ms integer NOT NULL DEFAULT 10000 CHECK (freeze_after_ms > 0),
  capacity integer NOT NULL DEFAULT 200 CHECK (capacity > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dt_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      distributed_transactions, dt_participants, dt_decisions, dt_outbox,
      dt_coordinator_lease, dt_config TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE dt_decisions_id_seq, dt_outbox_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON
      distributed_transactions, dt_participants, dt_decisions, dt_outbox, dt_config
      TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    for table in ("dt_config", "dt_coordinator_lease", "dt_outbox", "dt_decisions",
                  "dt_participants", "distributed_transactions"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
