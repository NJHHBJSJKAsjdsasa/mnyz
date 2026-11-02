"""planet visit log

Revision ID: 0133_planet_visits
Revises: 0132_relics
Create Date: 2026-10-28

The daily milestone panel counted "galaxies / systems / planets explored" by
scanning the client's archive blobs. That made the number unverifiable (and
inflatable), and it meant two different "today's progress" counters existed next
to ``/tasks``. This table is the server-side fact behind the first one:

* one row per ``(player, planet_key)`` — the primary key is the dedupe;
* ``coords`` and ``sector_key`` are denormalised so counting galaxies/systems is a
  single indexed aggregate instead of parsing keys in Python;
* ``first_visit_at`` is the only timestamp, because "when did I first see this"
  is the only question the panel asks.
"""

from __future__ import annotations

from alembic import op

revision = "0133_planet_visits"
down_revision = "0132_relics"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE planet_visits (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  coords text NOT NULL,
  sector_key text NOT NULL,
  first_visit_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key)
);
CREATE INDEX planet_visit_player_idx ON planet_visits (player_id, first_visit_at DESC);
CREATE INDEX planet_visit_sector_idx ON planet_visits (player_id, sector_key);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON planet_visits TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON planet_visits TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS planet_visits")
