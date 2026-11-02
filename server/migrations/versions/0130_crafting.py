"""fabricator: server-side production line

Revision ID: 0130_crafting
Revises: 0129_announcements
Create Date: 2026-10-28

Why this exists
---------------
Crafting was the last production loop that lived entirely in the browser: the tab
subtracted ``quantumAlloy`` from localStorage and added ``exoticCrystal`` back, so
a hand-edited save could mint rare materials. Recipes are reference data, not
player data, so they live in their own table and are seeded here.

Cooldown is ``ready_at`` on the *last run*, not a separate timer: one row per
craft is also the audit trail of what was produced and for which ledger
transactions.
"""

from __future__ import annotations

from alembic import op

revision = "0130_crafting"
down_revision = "0129_announcements"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE craft_recipes (
  code text PRIMARY KEY,
  name text NOT NULL,
  cost jsonb NOT NULL,
  output jsonb NOT NULL,
  cooldown_seconds integer NOT NULL CHECK (cooldown_seconds > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE craft_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipe_code text NOT NULL REFERENCES craft_recipes(code) ON DELETE RESTRICT,
  ready_at timestamptz NOT NULL,
  tx_in uuid,
  tx_out uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX craft_run_player_idx ON craft_runs (player_id, recipe_code, created_at DESC);
"""

SEED = """
INSERT INTO craft_recipes (code, name, cost, output, cooldown_seconds) VALUES
  ('alloy', '合金压铸', '{"quantumAlloy": 30, "plasmaCell": 20}', '{"exoticCrystal": 6}', 7200),
  ('etch', '神经蚀刻', '{"neuralCircuit": 24, "quantumAlloy": 12}', '{"ancientRelic": 2}', 10800),
  ('compress', '尘埃压缩', '{"nebulaDust": 20, "plasmaCell": 15}', '{"alienArtifact": 1}', 14400)
ON CONFLICT (code) DO NOTHING;
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT ON craft_recipes TO atlas_app;
    GRANT SELECT, INSERT ON craft_runs TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON craft_recipes TO atlas_readonly;
    GRANT SELECT ON craft_runs TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(SEED)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS craft_runs")
    op.execute("DROP TABLE IF EXISTS craft_recipes")
