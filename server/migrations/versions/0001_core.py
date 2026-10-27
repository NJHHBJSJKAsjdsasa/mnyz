"""core: universes, accounts, players, sessions, guest devices

Revision ID: 0001_core
Revises:
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0001_core"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE universes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_name text NOT NULL UNIQUE,
  seed bigint NOT NULL,
  cosmic_origin_time bigint NOT NULL,
  world_mode text NOT NULL DEFAULT 'private' CHECK (world_mode IN ('private','shared')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext,
  password_hash text,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'guest' CHECK (status IN ('guest','active','locked','deleted')),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','ops','admin')),
  failed_logins smallint NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until timestamptz,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT active_requires_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX accounts_email_uq ON accounts (email) WHERE email IS NOT NULL;
CREATE INDEX accounts_status_idx ON accounts (status) WHERE status <> 'active';

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE RESTRICT,
  slot smallint NOT NULL DEFAULT 1,
  display_name text NOT NULL DEFAULT '舰长',
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  last_settled_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  locked_reason text,
  UNIQUE (account_id, universe_id, slot)
);
CREATE INDEX players_seen_idx ON players (last_seen_at DESC);
CREATE INDEX players_account_idx ON players (account_id);
CREATE INDEX players_universe_idx ON players (universe_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL UNIQUE,
  rotated_from uuid REFERENCES sessions(id),
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);
CREATE INDEX sessions_account_idx ON sessions (account_id, revoked_at);
CREATE INDEX sessions_player_idx ON sessions (player_id);

-- Guests need a stable device → player mapping; the docs' table list had no
-- storage for it, and /session promises "same device, same player".
CREATE TABLE guest_devices (
  device_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_devices_account_idx ON guest_devices (account_id);

INSERT INTO universes (seed_name, seed, cosmic_origin_time)
VALUES ('atlas-main', 20261025, 1735689600000)
ON CONFLICT (seed_name) DO NOTHING;
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON universes, accounts, players, sessions, guest_devices TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON universes, accounts, players, sessions, guest_devices TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute(
        """
DROP TABLE IF EXISTS guest_devices;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS universes;
"""
    )
