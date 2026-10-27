"""stock market: listings, order book, trades, candles, margin and delisting

Revision ID: 0112_stock_market
Revises: 0111_commerce_property
Create Date: 2026-10-27

Design references: docs/cosmic-economy/05 §2/§4/§5/§7, 07 §1.

Scope
-----
* listings on the official universe exchange (``CUEX``);
* order book (limit + market), trades, holders with T+1 lock, five candle
  intervals and the daily summary used by indices;
* margin accounts, securities lending and short positions (05 §1.2);
* dividend records and delisting cases.

Three extra columns are kept on ``stock_listings`` beyond 05 §2 because the
matching engine needs them: ``last_price`` (mark), ``prev_close`` (circuit
breaker reference) and ``halted_until``/``halt_reason`` (05 §6).
"""

from __future__ import annotations

from alembic import op

revision = "0112_stock_market"
down_revision = "0111_commerce_property"
branch_labels = None
depends_on = None


MARKET = """
INSERT INTO exchanges (code, name, kind, currency_code, status)
VALUES ('CUEX', '宇宙联合交易所', 'official', 'cc4', 'active')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE stock_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticker text NOT NULL UNIQUE CHECK (ticker ~ '^[A-Z][A-Z0-9]{2,7}$'),
  currency_code text NOT NULL DEFAULT 'cc4' REFERENCES currencies(code),
  total_shares bigint NOT NULL CHECK (total_shares > 0),
  free_float bigint NOT NULL DEFAULT 0 CHECK (free_float >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','listed','suspended','delisted')),
  ipo_price numeric(30,4) NOT NULL CHECK (ipo_price > 0),
  last_price numeric(30,4) NOT NULL DEFAULT 0 CHECK (last_price >= 0),
  prev_close numeric(30,4) NOT NULL DEFAULT 0 CHECK (prev_close >= 0),
  listed_at timestamptz,
  settlement_mode text NOT NULL DEFAULT 't0' CHECK (settlement_mode IN ('t0','t1')),
  circuit_breaker_pct numeric(5,4) NOT NULL DEFAULT 0.2000
    CHECK (circuit_breaker_pct > 0 AND circuit_breaker_pct < 1),
  shortable boolean NOT NULL DEFAULT true,
  halted_until timestamptz,
  halt_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (free_float <= total_shares)
);
CREATE INDEX stock_listing_company_idx ON stock_listings (company_id);
CREATE INDEX stock_listing_status_idx ON stock_listings (status, listed_at DESC);

CREATE TABLE stock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  type text NOT NULL CHECK (type IN ('limit','market')),
  price numeric(30,4) CHECK (price IS NULL OR price > 0),
  quantity bigint NOT NULL CHECK (quantity > 0),
  filled bigint NOT NULL DEFAULT 0 CHECK (filled >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partial','filled','cancelled','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (filled <= quantity),
  CHECK (type <> 'limit' OR price IS NOT NULL)
);
CREATE INDEX stock_order_book_idx
  ON stock_orders (listing_id, status, side, price, created_at);
CREATE INDEX stock_order_actor_idx ON stock_orders (actor_id, created_at DESC);

CREATE TABLE stock_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  buy_order_id uuid NOT NULL REFERENCES stock_orders(id) ON DELETE RESTRICT,
  sell_order_id uuid NOT NULL REFERENCES stock_orders(id) ON DELETE RESTRICT,
  buyer_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  seller_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  price numeric(30,4) NOT NULL CHECK (price > 0),
  quantity bigint NOT NULL CHECK (quantity > 0),
  fee_buy numeric(30,4) NOT NULL DEFAULT 0 CHECK (fee_buy >= 0),
  fee_sell numeric(30,4) NOT NULL DEFAULT 0 CHECK (fee_sell >= 0),
  tax numeric(30,4) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  tx_id uuid REFERENCES currency_ledger_transactions(id),
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_trade_listing_idx ON stock_trades (listing_id, executed_at DESC);
CREATE INDEX stock_trade_actor_idx ON stock_trades (buyer_actor_id, executed_at DESC);

CREATE TABLE stock_candles (
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  interval text NOT NULL CHECK (interval IN ('1m','5m','15m','1h','1d')),
  bucket_start timestamptz NOT NULL,
  open numeric(30,4) NOT NULL,
  high numeric(30,4) NOT NULL,
  low numeric(30,4) NOT NULL,
  close numeric(30,4) NOT NULL,
  volume bigint NOT NULL DEFAULT 0,
  quote_volume numeric(30,4) NOT NULL DEFAULT 0,
  trades integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, interval, bucket_start)
);

CREATE TABLE stock_holders (
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  shares bigint NOT NULL DEFAULT 0 CHECK (shares >= 0),
  locked_shares bigint NOT NULL DEFAULT 0 CHECK (locked_shares >= 0),
  locked_until timestamptz,
  avg_cost numeric(30,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, listing_id),
  CHECK (locked_shares <= shares)
);
CREATE INDEX stock_holder_listing_idx ON stock_holders (listing_id, shares DESC);

CREATE TABLE stock_daily_summary (
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  trade_date date NOT NULL,
  open numeric(30,4) NOT NULL DEFAULT 0,
  high numeric(30,4) NOT NULL DEFAULT 0,
  low numeric(30,4) NOT NULL DEFAULT 0,
  close numeric(30,4) NOT NULL DEFAULT 0,
  prev_close numeric(30,4) NOT NULL DEFAULT 0,
  change_pct numeric(10,6) NOT NULL DEFAULT 0,
  volume bigint NOT NULL DEFAULT 0,
  quote_volume numeric(30,4) NOT NULL DEFAULT 0,
  trades integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, trade_date)
);

CREATE TABLE dividends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES stock_listings(id) ON DELETE SET NULL,
  per_share numeric(30,4) NOT NULL CHECK (per_share > 0),
  total_paid numeric(30,4) NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'cc4' REFERENCES currencies(code),
  record_at timestamptz NOT NULL DEFAULT now(),
  pay_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'announced'
    CHECK (status IN ('announced','paid')),
  tx_id uuid REFERENCES currency_ledger_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dividend_company_idx ON dividends (company_id, created_at DESC);

CREATE TABLE margin_accounts (
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  currency_code text NOT NULL DEFAULT 'cc4' REFERENCES currencies(code),
  cash numeric(30,4) NOT NULL DEFAULT 0 CHECK (cash >= 0),
  collateral jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','margin_call','liquidating','closed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, currency_code)
);

CREATE TABLE securities_lending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  lender_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  borrower_actor_id uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  quantity bigint NOT NULL CHECK (quantity > 0),
  fee_bps integer NOT NULL DEFAULT 300 CHECK (fee_bps BETWEEN 100 AND 1000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','borrowed','returned','defaulted')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lending_pool_idx ON securities_lending (listing_id, status, created_at);

CREATE TABLE short_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  quantity bigint NOT NULL CHECK (quantity > 0),
  entry_price numeric(30,4) NOT NULL CHECK (entry_price > 0),
  borrowed_from uuid REFERENCES securities_lending(id) ON DELETE SET NULL,
  margin numeric(30,4) NOT NULL DEFAULT 0,
  fee_paid numeric(30,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','covered','forced','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_price numeric(30,4)
);
CREATE INDEX short_position_open_idx ON short_positions (listing_id, status);
CREATE INDEX short_position_actor_idx ON short_positions (actor_id, status);

CREATE TABLE delisting_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'triggered'
    CHECK (status IN ('triggered','auction','settled','cancelled')),
  last_price numeric(30,4) NOT NULL DEFAULT 0,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX delisting_open_idx ON delisting_cases (status, triggered_at);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      stock_listings, stock_orders, stock_trades, stock_candles, stock_holders,
      stock_daily_summary, dividends, margin_accounts, securities_lending,
      short_positions, delisting_cases
      TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON
      stock_listings, stock_orders, stock_trades, stock_candles, stock_holders,
      stock_daily_summary, dividends, delisting_cases
      TO atlas_readonly;
  END IF;
END $$;
"""

DOWNGRADE = [
    "DROP TABLE IF EXISTS delisting_cases",
    "DROP TABLE IF EXISTS short_positions",
    "DROP TABLE IF EXISTS securities_lending",
    "DROP TABLE IF EXISTS margin_accounts",
    "DROP TABLE IF EXISTS dividends",
    "DROP TABLE IF EXISTS stock_daily_summary",
    "DROP TABLE IF EXISTS stock_holders",
    "DROP TABLE IF EXISTS stock_candles",
    "DROP TABLE IF EXISTS stock_trades",
    "DROP TABLE IF EXISTS stock_orders",
    "DROP TABLE IF EXISTS stock_listings",
    "DELETE FROM exchanges WHERE code = 'CUEX' AND kind = 'official'",
]


def upgrade() -> None:
    op.execute(MARKET)
    op.execute(GRANTS)


def downgrade() -> None:
    for statement in DOWNGRADE:
        op.execute(statement)
