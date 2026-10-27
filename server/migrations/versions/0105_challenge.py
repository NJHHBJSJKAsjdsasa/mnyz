"""challenge codes: server-issued asynchronous PvP snapshots

Revision ID: 0105_challenge
Revises: 0104_local_save_import
Create Date: 2026-10-26
"""

from __future__ import annotations

from alembic import op

revision = "0105_challenge"
down_revision = "0104_local_save_import"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
ALTER TABLE combat_sessions
  ADD COLUMN challenge_code text,
  ADD COLUMN enemy_power integer;

CREATE TABLE challenge_codes (
  code text PRIMARY KEY,
  owner_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX challenge_owner_idx ON challenge_codes (owner_player_id, created_at DESC);
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_codes TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON challenge_codes TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS challenge_codes")
    op.execute(
        "ALTER TABLE combat_sessions DROP COLUMN IF EXISTS enemy_power, "
        "DROP COLUMN IF EXISTS challenge_code"
    )
