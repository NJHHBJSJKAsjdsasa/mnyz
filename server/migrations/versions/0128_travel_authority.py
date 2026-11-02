"""travel authority: server-side quote/commit for navigation

Revision ID: 0128_travel_authority
Revises: 0127_domain_events
Create Date: 2026-10-28

Design reference: docs/frontend-redesign/11-server-authority.md §4.1 / §4.4

Scope
-----
Navigation was the last economic action the client decided alone: the browser
computed distance and fuel and debited localStorage. Two tables move the
decision to the server without changing the page model:

* ``travel_quotes`` — a priced, 30 s TTL offer. ``cost`` is jsonb so a new fuel
  resource does not need a migration.
* ``travel_log``   — one row per committed jump. ``status='in_flight'`` until
  ``arrive_at``; it is what ``GET /state.in_flight`` reads.

The first pass does **not** block a second jump while one is in flight: the
2.x client navigates by page load, so imposing a wait would change the game
rather than protect it. Arrival is recorded, not enforced.
"""

from __future__ import annotations

from alembic import op

revision = "0128_travel_authority"
down_revision = "0127_domain_events"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE travel_quotes (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('galaxy','system','planet')),
  from_x bigint NOT NULL,
  from_y bigint NOT NULL,
  from_z bigint NOT NULL,
  to_x bigint NOT NULL,
  to_y bigint NOT NULL,
  to_z bigint NOT NULL,
  distance numeric(14,2) NOT NULL,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb,
  affordable boolean NOT NULL DEFAULT true,
  eta_seconds integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  travel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_quote_player_idx ON travel_quotes (player_id, created_at DESC);

CREATE TABLE travel_log (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES travel_quotes(id) ON DELETE SET NULL,
  ship_id uuid,
  kind text NOT NULL CHECK (kind IN ('galaxy','system','planet')),
  from_x bigint NOT NULL,
  from_y bigint NOT NULL,
  from_z bigint NOT NULL,
  to_x bigint NOT NULL,
  to_y bigint NOT NULL,
  to_z bigint NOT NULL,
  distance numeric(14,2) NOT NULL,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight','arrived')),
  depart_at timestamptz NOT NULL DEFAULT now(),
  arrive_at timestamptz NOT NULL,
  tx_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_log_player_idx ON travel_log (player_id, depart_at DESC);
CREATE INDEX travel_log_flight_idx ON travel_log (player_id, arrive_at) WHERE status = 'in_flight';
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE ON travel_quotes TO atlas_app;
    GRANT SELECT, INSERT, UPDATE ON travel_log TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON travel_quotes TO atlas_readonly;
    GRANT SELECT ON travel_log TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS travel_log")
    op.execute("DROP TABLE IF EXISTS travel_quotes")
