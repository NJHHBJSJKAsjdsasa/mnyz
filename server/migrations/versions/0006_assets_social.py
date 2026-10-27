"""assets and social: stations, fleet support, NPCs, factions, alliances

Revision ID: 0006_assets_social
Revises: 0005_market_contracts
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0006_assets_social"
down_revision = "0005_market_contracts"
branch_labels = None
depends_on = None

TABLES = (
    "stations, station_modules, fabrication_cooldowns, npc_residents, npc_relations, "
    "faction_reputation, alliances, alliance_members, alliance_invites, wrecks"
)


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  planet_name text NOT NULL,
  coordinates point NOT NULL,
  last_tick_at timestamptz NOT NULL DEFAULT now(),
  stored jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, planet_key)
);
CREATE INDEX stations_player_idx ON stations (player_id);

CREATE OR REPLACE FUNCTION stations_limit() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM stations WHERE player_id = NEW.player_id) >= 3 THEN
    RAISE EXCEPTION 'station_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER stations_limit_trg BEFORE INSERT ON stations
FOR EACH ROW EXECUTE FUNCTION stations_limit();

CREATE TABLE station_modules (
  station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES structure_definitions(code),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 999),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, module_code)
);

CREATE TABLE fabrication_cooldowns (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipe_code text NOT NULL,
  ready_at timestamptz NOT NULL,
  PRIMARY KEY (player_id, recipe_code)
);

CREATE TABLE npc_residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  callsign text NOT NULL,
  trait text NOT NULL,
  UNIQUE (universe_id, code)
);

CREATE TABLE npc_relations (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES npc_residents(id) ON DELETE CASCADE,
  favor smallint NOT NULL DEFAULT 0 CHECK (favor BETWEEN -10 AND 10),
  trades integer NOT NULL DEFAULT 0 CHECK (trades >= 0),
  last_met_at timestamptz,
  PRIMARY KEY (player_id, resident_id)
);

CREATE TABLE faction_reputation (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sector_key text NOT NULL,
  rep smallint NOT NULL DEFAULT 0 CHECK (rep BETWEEN -10 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, sector_key)
);

CREATE TABLE alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name citext NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alliance_members (
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alliance_id, player_id)
);
CREATE UNIQUE INDEX alliance_one_per_player ON alliance_members (player_id);

CREATE OR REPLACE FUNCTION alliance_members_limit() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM alliance_members WHERE alliance_id = NEW.alliance_id) >= 5 THEN
    RAISE EXCEPTION 'alliance_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER alliance_members_limit_trg BEFORE INSERT ON alliance_members
FOR EACH ROW EXECUTE FUNCTION alliance_members_limit();

CREATE TABLE alliance_invites (
  code text PRIMARY KEY,
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wrecks (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  tier smallint NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key)
);
"""
    )
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON {TABLES} TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON {TABLES} TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS wrecks")
    op.execute("DROP TABLE IF EXISTS alliance_invites")
    op.execute("DROP TABLE IF EXISTS alliance_members CASCADE")
    op.execute("DROP TABLE IF EXISTS alliances")
    op.execute("DROP TABLE IF EXISTS faction_reputation")
    op.execute("DROP TABLE IF EXISTS npc_relations")
    op.execute("DROP TABLE IF EXISTS npc_residents")
    op.execute("DROP TABLE IF EXISTS fabrication_cooldowns")
    op.execute("DROP TABLE IF EXISTS station_modules")
    op.execute("DROP TABLE IF EXISTS stations CASCADE")
