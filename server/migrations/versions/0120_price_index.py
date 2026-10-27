"""price indices and market-maker quotes

Revision ID: 0120_price_index
Revises: 0119_revenue_split
Create Date: 2026-10-27

Design references: docs/cosmic-economy/03 §4 (指数), 06 §6.1 (做市报价).

Scope
-----
* ``price_indices`` — one row per index (method, base value, base market cap);
* ``price_index_points`` — the published series, one point per minute;
* ``mm_quotes`` — quotes published by a market maker, kept for audit so a wider
  spread on a cross-region order can be explained after the fact (09 §13.5).

The index is computed from live listings, never stored as truth: a point is a
snapshot and can be recomputed from the market data at that minute.
"""

from __future__ import annotations

from alembic import op

revision = "0120_price_index"
down_revision = "0119_revenue_split"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE price_indices (
  code text PRIMARY KEY,
  name text NOT NULL,
  method text NOT NULL DEFAULT 'cap_weighted'
    CHECK (method IN ('cap_weighted','equal_weighted','price_weighted')),
  currency_code text NOT NULL REFERENCES currencies(code),
  base_value numeric(20,6) NOT NULL DEFAULT 1000 CHECK (base_value > 0),
  base_cap numeric(30,4),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_index_points (
  id bigserial PRIMARY KEY,
  index_code text NOT NULL REFERENCES price_indices(code) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  value numeric(20,6) NOT NULL CHECK (value > 0),
  change_pct numeric(10,6) NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (index_code, ts)
);

CREATE TABLE mm_quotes (
  id bigserial PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  mid numeric(30,4) NOT NULL CHECK (mid > 0),
  bid numeric(30,4) NOT NULL CHECK (bid > 0),
  ask numeric(30,4) NOT NULL CHECK (ask > 0),
  spread_bps integer NOT NULL DEFAULT 0,
  volatility_bps integer NOT NULL DEFAULT 0,
  inventory_skew_bps integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mm_quote_listing_idx ON mm_quotes (listing_id, created_at DESC);

INSERT INTO price_indices (code, name, method, currency_code, base_value) VALUES
  ('CSX', '宇宙股票综合指数', 'cap_weighted', 'cc4', 1000)
ON CONFLICT (code) DO NOTHING;
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON price_indices, price_index_points, mm_quotes
      TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE price_index_points_id_seq, mm_quotes_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON price_indices, price_index_points, mm_quotes TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mm_quotes")
    op.execute("DROP TABLE IF EXISTS price_index_points")
    op.execute("DROP TABLE IF EXISTS price_indices")
