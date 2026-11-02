"""relic archive

Revision ID: 0132_relics
Revises: 0131_weekly_claims
Create Date: 2026-10-28

The archive has five fragments; which fragment a planet yields is fixed by an
FNV-1a hash of its key (the same hash the client uses, so the text and the index
never disagree). Discovery and the one-time reward were localStorage-only, which
made the reward free to anyone who could type ``{"found":[1,2,3,4,5]}``.

Only *facts* are stored: which index was found on which planet, and whether the
completion reward was paid. The lore text itself stays in the client — it is
presentation, and regenerating it from the key is cheap.
"""

from __future__ import annotations

from alembic import op

revision = "0132_relics"
down_revision = "0131_weekly_claims"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE relic_fragments (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fragment_index smallint NOT NULL CHECK (fragment_index BETWEEN 1 AND 5),
  planet_key text NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, fragment_index)
);

CREATE TABLE relic_claims (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  tx_id uuid,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON relic_fragments TO atlas_app;
    GRANT SELECT, INSERT ON relic_claims TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON relic_fragments TO atlas_readonly;
    GRANT SELECT ON relic_claims TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS relic_claims")
    op.execute("DROP TABLE IF EXISTS relic_fragments")
