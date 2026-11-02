"""weekly challenge claims

Revision ID: 0131_weekly_claims
Revises: 0130_crafting
Create Date: 2026-10-28

The weekly goal itself is derived (explored planets / total module levels / codex
entries are all server data already). What cannot be derived is *whether the
reward was claimed*, so that is the only thing stored: one row per
``(player, week)``, with the ledger transaction that paid it.
"""

from __future__ import annotations

from alembic import op

revision = "0131_weekly_claims"
down_revision = "0130_crafting"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE weekly_claims (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  tx_id uuid,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, week_key)
);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON weekly_claims TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON weekly_claims TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS weekly_claims")
