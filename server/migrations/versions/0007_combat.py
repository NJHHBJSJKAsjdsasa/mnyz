"""combat sessions and replayable turns

Revision ID: 0007_combat
Revises: 0006_assets_social
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0007_combat"
down_revision = "0006_assets_social"
branch_labels = None
depends_on = None

TABLES = "combat_sessions, combat_turns, combat_loot"


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE combat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text,
  mode text NOT NULL DEFAULT 'pve' CHECK (mode IN ('pve','challenge')),
  seed bigint NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','lost','fled','void')),
  turn_no integer NOT NULL DEFAULT 1 CHECK (turn_no >= 1),
  player_hp integer NOT NULL,
  player_shield integer NOT NULL DEFAULT 0,
  enemy_hp integer NOT NULL,
  enemy_shield integer NOT NULL DEFAULT 0,
  escorts jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX combat_active_idx ON combat_sessions (player_id) WHERE status = 'active';

CREATE TABLE combat_turns (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
  turn_no integer NOT NULL CHECK (turn_no >= 1),
  action text NOT NULL CHECK (action IN ('fire','shield','evade','flee')),
  damage integer NOT NULL DEFAULT 0,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_no)
);

CREATE TABLE combat_loot (
  session_id uuid PRIMARY KEY REFERENCES combat_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tx_id uuid REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
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
    GRANT USAGE, SELECT ON SEQUENCE combat_turns_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON {TABLES} TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS combat_loot")
    op.execute("DROP TABLE IF EXISTS combat_turns")
    op.execute("DROP TABLE IF EXISTS combat_sessions")
