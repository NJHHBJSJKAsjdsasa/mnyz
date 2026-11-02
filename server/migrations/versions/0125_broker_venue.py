"""brokerage membership, agency commission and multi-venue listings

Revision ID: 0125_broker_venue
Revises: 0124_split_archive
Create Date: 2026-10-28

Design references: docs/cosmic-economy/05 §9（券商/经纪）, 03 §5（多交易所）.

Scope
-----
* ``broker_memberships``: a securities firm admitted to one venue, with the
  commission it may charge there;
* ``broker_accounts``: a client's agency relationship (at most one active
  broker per client — the client can switch by closing and reopening);
* ``broker_commissions``: per-trade audit of what the broker actually earned;
* ``listing_venues`` + ``venue_id`` on orders/trades: one ticker can be traded
  on several venues, each with its own book and its own commission rate.

Existing bookings are backfilled to the listing's primary venue, so nothing
changes for a single-venue deployment.
"""

from __future__ import annotations

from alembic import op

revision = "0125_broker_venue"
down_revision = "0124_split_archive"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE broker_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','revoked')),
  commission_bps integer NOT NULL DEFAULT 5
    CHECK (commission_bps >= 0 AND commission_bps <= 100),
  admitted_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_actor_id, exchange_id)
);
CREATE INDEX broker_membership_exchange_idx ON broker_memberships (exchange_id, status);

CREATE TABLE broker_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_actor_id uuid NOT NULL UNIQUE REFERENCES economic_actors(id) ON DELETE CASCADE,
  broker_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  commission_bps integer NOT NULL DEFAULT 0
    CHECK (commission_bps >= 0 AND commission_bps <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX broker_account_broker_idx ON broker_accounts (broker_actor_id, status);

CREATE TABLE broker_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES stock_trades(id) ON DELETE CASCADE,
  broker_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  client_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  exchange_id uuid REFERENCES exchanges(id) ON DELETE SET NULL,
  currency_code text NOT NULL REFERENCES currencies(code),
  notional numeric(30,4) NOT NULL CHECK (notional >= 0),
  commission_bps integer NOT NULL CHECK (commission_bps >= 0),
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, client_actor_id)
);
CREATE INDEX broker_commission_broker_idx ON broker_commissions (broker_actor_id, created_at DESC);

CREATE TABLE listing_venues (
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  fee_bps integer NOT NULL DEFAULT 10 CHECK (fee_bps >= 0 AND fee_bps <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  admitted_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, exchange_id)
);
CREATE INDEX listing_venue_exchange_idx ON listing_venues (exchange_id, status);

ALTER TABLE stock_orders ADD COLUMN venue_id uuid REFERENCES exchanges(id) ON DELETE RESTRICT;
ALTER TABLE stock_trades ADD COLUMN venue_id uuid REFERENCES exchanges(id) ON DELETE SET NULL;
"""

BACKFILL = """
UPDATE stock_orders o SET venue_id = l.exchange_id
  FROM stock_listings l WHERE l.id = o.listing_id AND o.venue_id IS NULL;
UPDATE stock_trades t SET venue_id = l.exchange_id
  FROM stock_listings l WHERE l.id = t.listing_id AND t.venue_id IS NULL;

INSERT INTO listing_venues (listing_id, exchange_id, fee_bps)
SELECT l.id, l.exchange_id, COALESCE(e.fee_bps, 10)
  FROM stock_listings l JOIN exchanges e ON e.id = l.exchange_id
ON CONFLICT (listing_id, exchange_id) DO NOTHING;

CREATE INDEX stock_order_venue_book_idx
  ON stock_orders (listing_id, venue_id, side, status, price);
CREATE INDEX stock_trade_venue_idx ON stock_trades (venue_id, executed_at DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      broker_memberships, broker_accounts, broker_commissions, listing_venues TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON
      broker_memberships, broker_accounts, broker_commissions, listing_venues TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(BACKFILL)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS stock_trade_venue_idx")
    op.execute("DROP INDEX IF EXISTS stock_order_venue_book_idx")
    op.execute("ALTER TABLE stock_trades DROP COLUMN IF EXISTS venue_id")
    op.execute("ALTER TABLE stock_orders DROP COLUMN IF EXISTS venue_id")
    for table in ("listing_venues", "broker_commissions", "broker_accounts", "broker_memberships"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
