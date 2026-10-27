"""player appellate panels

Revision ID: 0121_court_panel
Revises: 0120_price_index
Create Date: 2026-10-27

Design references: docs/cosmic-economy/08 §12.1.

Scope
-----
An appeal can be heard by a **player panel** instead of the deterministic appellate
review: 5 drawn from the eligible pool (3 serving + 2 alternates), each side may
strike one without cause, members may be struck for cause by the court, and the
majority decides. AI players sit in the same pool under the same rules (§7).
"""

from __future__ import annotations

from alembic import op

revision = "0121_court_panel"
down_revision = "0120_price_index"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE court_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  appeal_id uuid REFERENCES court_appeals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'serving'
    CHECK (status IN ('drawing','serving','decided','cancelled')),
  verdict text CHECK (verdict IN ('upheld','overturned')),
  dissent jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX court_panel_case_idx ON court_panels (case_id, created_at DESC);

CREATE TABLE court_panel_members (
  panel_id uuid NOT NULL REFERENCES court_panels(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
  role text NOT NULL DEFAULT 'judge' CHECK (role IN ('judge','alternate')),
  status text NOT NULL DEFAULT 'drawn'
    CHECK (status IN ('drawn','serving','struck','voted')),
  vote text CHECK (vote IN ('upheld','overturned')),
  reason text NOT NULL DEFAULT '',
  voted_at timestamptz,
  PRIMARY KEY (panel_id, actor_id)
);
CREATE INDEX court_panel_member_actor_idx ON court_panel_members (actor_id, status);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON court_panels, court_panel_members TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON court_panels, court_panel_members TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS court_panel_members")
    op.execute("DROP TABLE IF EXISTS court_panels")
