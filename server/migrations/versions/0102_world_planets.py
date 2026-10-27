"""world_planets: shared ownership and asynchronous sieges

Revision ID: 0102_world_planets
Revises: 0101_planet_data
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0102_world_planets"
down_revision = "0101_planet_data"
branch_labels = None
depends_on = None

TABLES = (
    "world_planets, planet_ownership_history, sieges, siege_participants, loot_escrow"
)


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE world_planets (
  planet_key text PRIMARY KEY,
  owner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  owner_alliance_id uuid REFERENCES alliances(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  shield_until timestamptz,
  defense_power integer NOT NULL DEFAULT 0 CHECK (defense_power >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 999),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX world_planets_owner_idx ON world_planets (owner_player_id);

CREATE TABLE planet_ownership_history (
  id bigserial PRIMARY KEY,
  planet_key text NOT NULL,
  owner_player_id uuid,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  lost_at timestamptz,
  reason text
);
CREATE INDEX planet_history_key_idx ON planet_ownership_history (planet_key, acquired_at DESC);

CREATE TABLE sieges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_key text NOT NULL,
  attacker_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  defender_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  resolve_at timestamptz NOT NULL,
  attacker_power integer NOT NULL DEFAULT 0 CHECK (attacker_power >= 0),
  defender_power integer NOT NULL DEFAULT 0 CHECK (defender_power >= 0),
  seed bigint NOT NULL,
  status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','resolved','cancelled')),
  outcome text CHECK (outcome IN ('attacker_won','defender_held')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_siege ON sieges (planet_key) WHERE status = 'locked';
CREATE INDEX sieges_due_idx ON sieges (resolve_at) WHERE status = 'locked';

CREATE TABLE siege_participants (
  siege_id uuid NOT NULL REFERENCES sieges(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fleet_power integer NOT NULL DEFAULT 0 CHECK (fleet_power >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (siege_id, player_id)
);

CREATE TABLE loot_escrow (
  id bigserial PRIMARY KEY,
  siege_id uuid REFERENCES sieges(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loot_escrow_player_idx ON loot_escrow (player_id) WHERE released_at IS NULL;
"""
    )
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON {TABLES} TO atlas_app;
    GRANT SELECT, INSERT ON planet_ownership_history TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE planet_ownership_history_id_seq, loot_escrow_id_seq TO atlas_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON planet_ownership_history FROM atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON {TABLES} TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS loot_escrow")
    op.execute("DROP TABLE IF EXISTS siege_participants")
    op.execute("DROP TABLE IF EXISTS sieges")
    op.execute("DROP TABLE IF EXISTS planet_ownership_history")
    op.execute("DROP TABLE IF EXISTS world_planets")
