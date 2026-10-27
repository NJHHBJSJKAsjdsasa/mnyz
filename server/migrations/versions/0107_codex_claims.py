"""codex completion rewards

Revision ID: 0107_codex_claims
Revises: 0106_tasks
Create Date: 2026-10-26
"""

from __future__ import annotations

from alembic import op

revision = "0107_codex_claims"
down_revision = "0106_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE codex_claims (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('planets','elements','lifeForms')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, section)
);
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON codex_claims TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON codex_claims TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS codex_claims")
