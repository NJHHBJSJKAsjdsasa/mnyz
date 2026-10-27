"""universe_cache: derived galaxy/system/planet cache in PostgreSQL

Revision ID: 0100_universe_cache
Revises: 0008_platform
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0100_universe_cache"
down_revision = "0008_platform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE SCHEMA IF NOT EXISTS universe_cache;

CREATE TABLE universe_cache.cache_meta (
  universe_id uuid PRIMARY KEY,
  generator_version integer NOT NULL DEFAULT 1 CHECK (generator_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- fillfactor leaves room for the sampled hit_count update without page splits.
CREATE TABLE universe_cache.galaxies (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  x integer NOT NULL CHECK (x BETWEEN 0 AND 10000000),
  y integer NOT NULL CHECK (y BETWEEN 0 AND 10000000),
  z integer NOT NULL CHECK (z BETWEEN 0 AND 10000000),
  data jsonb NOT NULL,
  generator_version integer NOT NULL,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, x, y, z)
) WITH (fillfactor = 85);

CREATE TABLE universe_cache.systems (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  x integer NOT NULL CHECK (x BETWEEN 0 AND 10000000),
  y integer NOT NULL CHECK (y BETWEEN 0 AND 10000000),
  z integer NOT NULL CHECK (z BETWEEN 0 AND 10000000),
  system_index integer NOT NULL CHECK (system_index >= 0),
  data jsonb NOT NULL,
  generator_version integer NOT NULL,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, x, y, z, system_index)
) WITH (fillfactor = 85);

CREATE TABLE universe_cache.planets (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  x integer NOT NULL CHECK (x BETWEEN 0 AND 10000000),
  y integer NOT NULL CHECK (y BETWEEN 0 AND 10000000),
  z integer NOT NULL CHECK (z BETWEEN 0 AND 10000000),
  system_index integer NOT NULL CHECK (system_index >= 0),
  planet_name text NOT NULL CHECK (length(planet_name) BETWEEN 1 AND 200),
  data jsonb NOT NULL,
  generator_version integer NOT NULL,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, x, y, z, system_index, planet_name)
) WITH (fillfactor = 85);

CREATE INDEX galaxies_evict_idx ON universe_cache.galaxies (universe_id, updated_at, id);
CREATE INDEX systems_evict_idx ON universe_cache.systems (universe_id, updated_at, id);
CREATE INDEX planets_evict_idx ON universe_cache.planets (universe_id, updated_at, id);
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT USAGE ON SCHEMA universe_cache TO atlas_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA universe_cache TO atlas_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA universe_cache TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT USAGE ON SCHEMA universe_cache TO atlas_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA universe_cache TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS universe_cache CASCADE")
