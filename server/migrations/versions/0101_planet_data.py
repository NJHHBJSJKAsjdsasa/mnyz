"""planet_data: player modifications on top of generated planets

Revision ID: 0101_planet_data
Revises: 0100b_contract_reward
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0101_planet_data"
down_revision = "0100b_contract_reward"
branch_labels = None
depends_on = None

TABLES = (
    "planet_claims, planet_structures, planet_deposits, planet_modifiers, "
    "planet_audit, planet_events"
)


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE planet_claims (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key)
);
CREATE INDEX planet_claims_recent_idx ON planet_claims (claimed_at DESC);

CREATE TABLE planet_structures (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  structure_code text NOT NULL REFERENCES structure_definitions(code),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 999),
  built_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key, structure_code)
);

CREATE TABLE planet_deposits (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  resource_code text NOT NULL REFERENCES resource_types(code),
  amount numeric(20,4) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key, resource_code)
);

CREATE TABLE planet_modifiers (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  target text NOT NULL,
  value numeric(20,4) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key, target)
);

CREATE TABLE planet_audit (
  id bigserial PRIMARY KEY,
  player_id uuid,
  planet_key text NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planet_audit_key_idx ON planet_audit (planet_key, created_at DESC);

CREATE TABLE planet_events (
  id bigserial PRIMARY KEY,
  planet_key text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
"""
    )
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON {TABLES} TO atlas_app;
    GRANT SELECT, INSERT ON planet_audit TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE planet_audit_id_seq, planet_events_id_seq TO atlas_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON planet_audit FROM atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON {TABLES} TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS planet_events")
    op.execute("DROP TABLE IF EXISTS planet_audit")
    op.execute("DROP TABLE IF EXISTS planet_modifiers")
    op.execute("DROP TABLE IF EXISTS planet_deposits")
    op.execute("DROP TABLE IF EXISTS planet_structures")
    op.execute("DROP TABLE IF EXISTS planet_claims")
