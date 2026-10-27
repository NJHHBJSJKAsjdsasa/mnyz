"""local save import: one snapshot per player

Revision ID: 0104_local_save_import
Revises: 0103_cutover
Create Date: 2026-10-26
"""

from __future__ import annotations

from alembic import op

revision = "0104_local_save_import"
down_revision = "0103_cutover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE local_save_imports (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payload_hash text NOT NULL,
  keys_count integer NOT NULL CHECK (keys_count >= 0),
  imported jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON local_save_imports TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON local_save_imports TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS local_save_imports")
