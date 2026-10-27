"""cutover: feature flags, shadow state, factions, saga steps

Revision ID: 0103_cutover
Revises: 0102_world_planets
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0103_cutover"
down_revision = "0102_world_planets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
ALTER TABLE feature_flags
  ADD COLUMN mode text NOT NULL DEFAULT 'local'
    CHECK (mode IN ('local','shadow','server')),
  ADD COLUMN rollout_pct smallint NOT NULL DEFAULT 0
    CHECK (rollout_pct BETWEEN 0 AND 100),
  ADD COLUMN updated_by text;

INSERT INTO feature_flags (name, enabled, mode, rollout_pct, description) VALUES
  ('domain.explore', false, 'local', 0, 'collect/scan/surface read and write'),
  ('domain.economy', false, 'local', 0, 'market/contracts/refit/tech'),
  ('domain.assets', false, 'local', 0, 'stations/fleet/colony'),
  ('domain.combat', false, 'local', 0, 'combat and sieges')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE player_flag_overrides (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  flag_key text NOT NULL REFERENCES feature_flags(name) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('local','shadow','server')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (player_id, flag_key)
);

CREATE TABLE player_shadow_state (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  state_version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE factions (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  color text NOT NULL
);
INSERT INTO factions (code, name, description, color) VALUES
  ('keepers', '遗迹守望者', '守护前文明遗物，偏好遗迹交易。', '#8b5cf6'),
  ('guild', '星环商会', '控制航道贸易，偏好合金与回路。', '#f59e0b'),
  ('wardens', '边境巡逻队', '清剿航道，偏好等离子与武器模块。', '#38bdf8'),
  ('chorus', '深空合唱团', '研究星尘与维度碎片。', '#ec4899')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE saga_steps (
  saga_id uuid NOT NULL,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (saga_id, step)
);
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flags, player_flag_overrides,
      player_shadow_state, saga_steps TO atlas_app;
    GRANT SELECT ON factions TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON feature_flags, player_flag_overrides, player_shadow_state,
      factions, saga_steps TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS saga_steps")
    op.execute("DROP TABLE IF EXISTS factions")
    op.execute("DROP TABLE IF EXISTS player_shadow_state")
    op.execute("DROP TABLE IF EXISTS player_flag_overrides")
    op.execute(
        "ALTER TABLE feature_flags DROP COLUMN IF EXISTS updated_by, "
        "DROP COLUMN IF EXISTS rollout_pct, DROP COLUMN IF EXISTS mode"
    )
