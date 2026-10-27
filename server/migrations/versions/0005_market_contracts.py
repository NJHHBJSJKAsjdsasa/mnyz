"""market and contracts

Revision ID: 0005_market_contracts
Revises: 0004_progress
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0005_market_contracts"
down_revision = "0004_progress"
branch_labels = None
depends_on = None

TABLES = "market_days, market_quotes, trade_orders, contracts, contract_events, player_tasks"


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE market_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_key text NOT NULL,
  game_day date NOT NULL,
  generated_by text NOT NULL DEFAULT 'lazy' CHECK (generated_by IN ('job','lazy')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (planet_key, game_day)
);

CREATE TABLE market_quotes (
  market_day_id uuid NOT NULL REFERENCES market_days(id) ON DELETE CASCADE,
  resource_code text NOT NULL REFERENCES resource_types(code),
  buy_price integer NOT NULL CHECK (buy_price > 0 AND buy_price <= 1000000),
  sell_price integer NOT NULL CHECK (sell_price > 0 AND sell_price <= 1000000),
  stock integer NOT NULL CHECK (stock >= 0),
  initial_stock integer NOT NULL CHECK (initial_stock >= 0),
  PRIMARY KEY (market_day_id, resource_code)
);

CREATE TABLE trade_orders (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  resource_code text NOT NULL REFERENCES resource_types(code),
  side text NOT NULL CHECK (side IN ('buy','sell')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price > 0),
  tax numeric(20,4) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  tx_id uuid REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_orders_player_idx ON trade_orders (player_id, created_at DESC);

CREATE TABLE contracts (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  id text NOT NULL,
  template_code text NOT NULL REFERENCES contract_templates(code),
  metric text NOT NULL CHECK (metric IN ('scans','trades','collections','relicScans','kills')),
  target integer NOT NULL CHECK (target > 0),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','claimed','expired')),
  taken_by text,
  target_galaxy point,
  target_distance integer CHECK (target_distance >= 0),
  reward_multiplier numeric(6,2) NOT NULL DEFAULT 1 CHECK (reward_multiplier >= 1),
  accepted_at timestamptz,
  expires_at timestamptz,
  game_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, id),
  CONSTRAINT accepted_requires_timestamp CHECK (status <> 'accepted' OR accepted_at IS NOT NULL)
);
CREATE INDEX contracts_day_idx ON contracts (player_id, game_day);
CREATE INDEX contracts_expiry_idx ON contracts (player_id, expires_at) WHERE status = 'accepted';

CREATE TABLE contract_events (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  contract_id text NOT NULL,
  delta integer NOT NULL,
  source text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_events_contract_idx ON contract_events (player_id, contract_id, at DESC);

CREATE TABLE player_tasks (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  task_code text NOT NULL,
  game_day date NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target integer NOT NULL DEFAULT 1 CHECK (target > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, task_code, game_day)
);
"""
    )
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON {TABLES} TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE trade_orders_id_seq, contract_events_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON {TABLES} TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS player_tasks")
    op.execute("DROP TABLE IF EXISTS contract_events")
    op.execute("DROP TABLE IF EXISTS contracts")
    op.execute("DROP TABLE IF EXISTS trade_orders")
    op.execute("DROP TABLE IF EXISTS market_quotes")
    op.execute("DROP TABLE IF EXISTS market_days")
