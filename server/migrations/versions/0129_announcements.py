"""operator announcements

Revision ID: 0129_announcements
Revises: 0128_travel_authority
Create Date: 2026-10-28

Design reference: docs/frontend-redesign/12-backend-second-pass.md §5
("全服公告" was listed as missing; every endpoint so far was player-facing).

Scope
-----
One table, no audience segmentation: an announcement is either active or not,
and ``starts_at`` / ``ends_at`` bound when it is shown. Severity reuses the four
levels of the status vocabulary in 09 §3 so the shell can render it with the
same component as everything else.
"""

from __future__ import annotations

from alembic import op

revision = "0129_announcements"
down_revision = "0128_travel_authority"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','caution','degraded','critical')),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcement_window_idx ON announcements (active, starts_at DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE ON announcements TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON announcements TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS announcements")
