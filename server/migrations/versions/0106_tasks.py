"""daily task definitions and server-side progress

Revision ID: 0106_tasks
Revises: 0105_challenge
Create Date: 2026-10-26
"""

from __future__ import annotations

from alembic import op

revision = "0106_tasks"
down_revision = "0105_challenge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE task_definitions (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  metric text NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  reward jsonb NOT NULL,
  sort integer NOT NULL DEFAULT 0
);
INSERT INTO task_definitions (code, title, description, metric, target, reward, sort) VALUES
  ('planetsDiscovered', '初次探索', '发现/访问 5 颗行星', 'planetsDiscovered', 5,
   '{"antimatter": 100, "element115": 50, "deuterium": 75}'::jsonb, 1),
  ('antimatterCollected', '资源收集者', '累计采集 100 反物质', 'antimatterCollected', 100,
   '{"quantumAlloy": 5, "plasmaCell": 3}'::jsonb, 2),
  ('galaxiesVisited', '星区开拓者', '解锁 2 个星区', 'galaxiesVisited', 2,
   '{"exoticCrystal": 2, "nebulaDust": 3}'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE ON task_definitions TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON task_definitions TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS task_definitions")
