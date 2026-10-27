"""AI economy: first-class AI players, agent profiles and the decision log

Revision ID: 0113_ai_economy
Revises: 0112_stock_market
Create Date: 2026-10-27

Design references: docs/cosmic-economy/06 §1/§3, 10 §2/§3/§4.6, 07 §1.

Scope
-----
* ``players.controller`` (added in 0110) is what makes an AI player a normal
  player row rather than a second kind of identity (06 §1);
* ``ai_agents`` — the 1:1 automation profile (persona, risk, status);
* ``ai_decisions`` — one auditable row per tick with the context that produced
  it, so ``replay(agent_id, tick)`` can recompute the same plan (10 §3.4);
* AI accounts are ``status='active'`` with ``email NULL`` and no password: the
  login path looks accounts up by email, so they can never authenticate.
  ``active_requires_password`` is relaxed to allow that shape.
"""

from __future__ import annotations

from alembic import op

revision = "0113_ai_economy"
down_revision = "0112_stock_market"
branch_labels = None
depends_on = None


PLAYERS = """
-- ``players.controller`` already exists since 0110 (human/server_ai); the AI
-- identity needs no schema change, only the account shape below.
CREATE INDEX IF NOT EXISTS players_controller_idx ON players (controller);

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS active_requires_password;
ALTER TABLE accounts
  ADD CONSTRAINT active_requires_password
  CHECK (status <> 'active' OR password_hash IS NOT NULL OR email IS NULL);
"""

AGENTS = """
CREATE TABLE ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  persona text NOT NULL CHECK (persona IN
    ('industrialist','banker','trader','quant','landlord','raider','explorer',
     'councilor','market_maker')),
  player_id uuid NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL UNIQUE REFERENCES economic_actors(id) ON DELETE CASCADE,
  faction_code text REFERENCES factions(code) ON DELETE SET NULL,
  capital_seed numeric(30,4) NOT NULL DEFAULT 0,
  risk_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','bankrupt')),
  last_tick_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_agent_status_idx ON ai_agents (status, last_tick_at);

CREATE TABLE ai_decisions (
  id bigserial PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  tick bigint NOT NULL DEFAULT 0,
  tick_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric(20,6) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'executed'
    CHECK (status IN ('executed','skipped','failed')),
  provider text NOT NULL DEFAULT 'deterministic',
  provider_version text NOT NULL DEFAULT '1',
  model text,
  prompt_hash text,
  latency_ms integer,
  fallback boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_decision_agent_idx ON ai_decisions (agent_id, tick_at DESC);
CREATE INDEX ai_decision_tick_idx ON ai_decisions (tick, agent_id);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agents, ai_decisions TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE ai_decisions_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON ai_agents, ai_decisions TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(PLAYERS)
    op.execute(AGENTS)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_decisions")
    op.execute("DROP TABLE IF EXISTS ai_agents")
    # AI accounts are the only ones shaped "active + no email + no password"; they
    # are locked (not deleted) so the stricter constraint can come back without
    # touching the ledger history that references their actors.
    op.execute(
        "UPDATE accounts SET status = 'locked' WHERE email IS NULL "
        "AND password_hash IS NULL AND status = 'active'"
    )
    op.execute("ALTER TABLE accounts DROP CONSTRAINT IF EXISTS active_requires_password")
    op.execute(
        "ALTER TABLE accounts ADD CONSTRAINT active_requires_password "
        "CHECK (status <> 'active' OR password_hash IS NOT NULL)"
    )
    # ``players.controller`` and its index belong to 0110 — leave them alone.
