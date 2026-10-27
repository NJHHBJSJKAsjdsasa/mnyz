"""cross-region judgment recognition

Revision ID: 0117_court_recognition
Revises: 0116_ai_decision_provider
Create Date: 2026-10-27

Design references: docs/cosmic-economy/08 §8 / §12.3, 09 §8.

Scope
-----
A judgment made in its home region is **not** automatically valid elsewhere: the
requested region's court has to recognize it first, and may refuse with one of
the eight reasons listed in 08 §12.3. Recognition can be appealed exactly once.
Enforcement in a foreign region is gated on a ``recognized`` row.
"""

from __future__ import annotations

from alembic import op

revision = "0117_court_recognition"
down_revision = "0116_ai_decision_provider"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE court_recognition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id uuid NOT NULL REFERENCES court_judgments(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  region text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','recognized','rejected','appealed','final')),
  reason_code text,
  reason text NOT NULL DEFAULT '',
  requested_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  decided_by text NOT NULL DEFAULT '',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (judgment_id, region)
);
CREATE INDEX recognition_case_idx ON court_recognition (case_id, created_at DESC);
CREATE INDEX recognition_status_idx ON court_recognition (status, region);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON court_recognition TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON court_recognition TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS court_recognition")
