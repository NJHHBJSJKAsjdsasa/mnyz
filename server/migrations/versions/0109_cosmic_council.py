"""cosmic council: AI seats, player seats, motions and votes

Revision ID: 0109_cosmic_council
Revises: 0108_universe_seed_numeric
Create Date: 2026-10-26
"""

from __future__ import annotations

from alembic import op

revision = "0109_cosmic_council"
down_revision = "0108_universe_seed_numeric"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE council_seats (
  seat_no integer PRIMARY KEY CHECK (seat_no BETWEEN 1 AND 7),
  name text NOT NULL,
  faction_code text REFERENCES factions(code) ON DELETE SET NULL,
  is_ai boolean NOT NULL DEFAULT false,
  player_id uuid UNIQUE REFERENCES players(id) ON DELETE SET NULL,
  joined_at timestamptz,
  focus text NOT NULL DEFAULT '平衡'
);

INSERT INTO council_seats (seat_no, name, faction_code, is_ai, focus) VALUES
  (1, '守望者·奥罗拉', 'keepers', true, '稳定与遗迹'),
  (2, '会计官·塞勒斯', 'guild', true, '贸易与财富'),
  (3, '监察官·萨布尔', 'wardens', true, '安全与边境'),
  (4, '观测员·伊里斯', 'chorus', true, '研究与深空'),
  (5, 'ATLAS-9', NULL, true, '全宇宙均衡'),
  (6, '开放席位', NULL, false, '玩家席位'),
  (7, '开放席位', NULL, false, '玩家席位')
ON CONFLICT (seat_no) DO NOTHING;

CREATE TABLE council_motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('sector_license','membership')),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sector_key text,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','passed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL,
  decided_at timestamptz,
  outcome_reason text
);
CREATE INDEX council_motion_open_idx ON council_motions (status, closes_at);
CREATE INDEX council_motion_player_idx ON council_motions (player_id, created_at DESC);

CREATE TABLE council_votes (
  motion_id uuid NOT NULL REFERENCES council_motions(id) ON DELETE CASCADE,
  seat_no integer NOT NULL REFERENCES council_seats(seat_no) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('yes','no')),
  reason text NOT NULL DEFAULT '',
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (motion_id, seat_no)
);
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON council_seats, council_motions, council_votes TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON council_seats, council_motions, council_votes TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS council_votes")
    op.execute("DROP TABLE IF EXISTS council_motions")
    op.execute("DROP TABLE IF EXISTS council_seats")
