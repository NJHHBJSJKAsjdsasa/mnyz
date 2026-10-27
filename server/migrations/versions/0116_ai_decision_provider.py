"""AI decision providers: registry, modes and the audit columns they need

Revision ID: 0116_ai_decision_provider
Revises: 0115_cross_region_2pc
Create Date: 2026-10-27

Design references: docs/cosmic-economy/10 §2/§4/§6, 07 §1.

Scope
-----
* ``ai_decision_providers``: one row per provider (``deterministic`` seeded
  ``live``, ``llm`` seeded ``disabled``), carrying mode, endpoint, model,
  timeout, action cap and the agent allowlist used by ``canary``;
* ``ai_decisions`` gains the token/provider-id/shadow audit columns required by
  10 §4.6 so a fallback or a shadow run is distinguishable after the fact.

No public API is added: providers are internal configuration, and nothing here
is exposed through player-facing responses (10 §4.2).
"""

from __future__ import annotations

from alembic import op

revision = "0116_ai_decision_provider"
down_revision = "0115_cross_region_2pc"
branch_labels = None
depends_on = None


PROVIDERS = """
CREATE TABLE ai_decision_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('deterministic','llm')),
  version text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled','shadow','canary','live')),
  endpoint text NOT NULL DEFAULT '',
  model text,
  timeout_ms integer NOT NULL DEFAULT 800 CHECK (timeout_ms BETWEEN 50 AND 10000),
  max_actions integer NOT NULL DEFAULT 5 CHECK (max_actions BETWEEN 1 AND 20),
  allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_decision_providers (name, kind, version, status, model, max_actions)
VALUES ('deterministic', 'deterministic', '1', 'live', NULL, 5),
       ('llm', 'llm', '1', 'disabled', NULL, 5)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE ai_decisions
  ADD COLUMN provider_id uuid REFERENCES ai_decision_providers(id) ON DELETE SET NULL,
  ADD COLUMN token_in integer,
  ADD COLUMN token_out integer,
  ADD COLUMN shadow boolean NOT NULL DEFAULT false;

CREATE INDEX ai_decision_provider_idx ON ai_decisions (provider_id, tick_at DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_decision_providers TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON ai_decision_providers TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(PROVIDERS)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ai_decision_provider_idx")
    for column in ("shadow", "token_out", "token_in", "provider_id"):
        op.execute(f"ALTER TABLE ai_decisions DROP COLUMN IF EXISTS {column}")
    op.execute("DROP TABLE IF EXISTS ai_decision_providers")
