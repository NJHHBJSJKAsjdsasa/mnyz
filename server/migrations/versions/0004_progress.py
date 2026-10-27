"""progress: ships, modules, cooldowns, scans, collections, codex, sectors

Revision ID: 0004_progress
Revises: 0003_economy
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0004_progress"
down_revision = "0003_economy"
branch_labels = None
depends_on = None

TABLES = (
    "ships, ship_modules, fleet_ships, planet_scans, codex_entries, sector_licenses, "
    "discoveries, surface_samples, cooldowns, collections, player_flags, player_tech"
)


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 999),
  ship_type text NOT NULL DEFAULT 'explorer',
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_flagship boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ships_one_flagship ON ships (player_id) WHERE is_flagship;
CREATE INDEX ships_player_idx ON ships (player_id);

CREATE TABLE ship_modules (
  ship_id uuid NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES module_definitions(code),
  level integer NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 999),
  overclock smallint NOT NULL DEFAULT 0 CHECK (overclock BETWEEN 0 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ship_id, module_code)
);

CREATE TABLE fleet_ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name text NOT NULL,
  task text NOT NULL DEFAULT 'idle' CHECK (task IN ('idle','mine','survey','trade')),
  last_tick_at timestamptz NOT NULL DEFAULT now(),
  stored jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_player_idx ON fleet_ships (player_id);

CREATE OR REPLACE FUNCTION fleet_ships_limit() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM fleet_ships WHERE player_id = NEW.player_id) >= 3 THEN
    RAISE EXCEPTION 'fleet_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER fleet_ships_limit_trg BEFORE INSERT ON fleet_ships
FOR EACH ROW EXECUTE FUNCTION fleet_ships_limit();

CREATE TABLE planet_scans (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  scans integer NOT NULL DEFAULT 0 CHECK (scans >= 0),
  last_at timestamptz,
  bonus_kind text,
  bonus_uses smallint NOT NULL DEFAULT 0 CHECK (bonus_uses >= 0),
  first_scan_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key)
);

CREATE TABLE codex_entries (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('planet','element','lifeform')),
  entry_key text NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, kind, entry_key)
);

CREATE TABLE sector_licenses (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sector_key text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, sector_key)
);

CREATE TABLE discoveries (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  galaxy_hash text NOT NULL,
  bitmap text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, galaxy_hash)
);

CREATE TABLE surface_samples (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  game_day date NOT NULL,
  used smallint NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 3),
  PRIMARY KEY (player_id, planet_key, game_day)
);

CREATE TABLE cooldowns (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key text NOT NULL,
  ready_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, key)
);
CREATE INDEX cooldowns_ready_idx ON cooldowns (ready_at);

CREATE TABLE collections (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  tx_id uuid REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  yield jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collections_player_planet_idx ON collections (player_id, planet_key, created_at DESC);

-- Player-wide scalars referenced by the formulas in docs/server/09 (hull,
-- vouchers) had no home in the table list; one row per player keeps it cheap.
CREATE TABLE player_flags (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  hull smallint NOT NULL DEFAULT 100 CHECK (hull BETWEEN 0 AND 100),
  vouchers integer NOT NULL DEFAULT 0 CHECK (vouchers >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_tech (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  node_code text NOT NULL REFERENCES tech_nodes(code),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, node_code)
);
"""
    )
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON {TABLES} TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE collections_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON {TABLES} TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS player_tech")
    op.execute("DROP TABLE IF EXISTS player_flags")
    op.execute("DROP TABLE IF EXISTS collections")
    op.execute("DROP TABLE IF EXISTS cooldowns")
    op.execute("DROP TABLE IF EXISTS surface_samples")
    op.execute("DROP TABLE IF EXISTS discoveries")
    op.execute("DROP TABLE IF EXISTS sector_licenses")
    op.execute("DROP TABLE IF EXISTS codex_entries")
    op.execute("DROP TABLE IF EXISTS planet_scans")
    op.execute("DROP TABLE IF EXISTS fleet_ships CASCADE")
    op.execute("DROP TABLE IF EXISTS ship_modules")
    op.execute("DROP TABLE IF EXISTS ships")
