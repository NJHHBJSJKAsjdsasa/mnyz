"""sub-exchange matching and market-maker programs

Revision ID: 0123_exchange_matching
Revises: 0122_liquidation_fx
Create Date: 2026-10-28

Design references: docs/cosmic-economy/03 §5 (交易所), 06 §6.1 (做市).

Scope
-----
* ``exchanges`` gains its own fee and listing fee, so a sub-exchange can price
  differently from the official one; ``stock_listings.exchange_id`` already
  records where a listing trades, matching therefore follows the listing;
* ``mm_programs`` lets an actor keep a standing two-sided quote on a listing so a
  job can refresh it instead of a human clicking every minute.
"""

from __future__ import annotations

from alembic import op

revision = "0123_exchange_matching"
down_revision = "0122_liquidation_fx"
branch_labels = None
depends_on = None


TABLES = """
ALTER TABLE exchanges
  ADD COLUMN fee_bps integer NOT NULL DEFAULT 10 CHECK (fee_bps BETWEEN 0 AND 100),
  ADD COLUMN listing_fee numeric(30,4) NOT NULL DEFAULT 0 CHECK (listing_fee >= 0),
  ADD COLUMN max_listings integer;

CREATE TABLE mm_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  last_run_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, listing_id)
);
CREATE INDEX mm_program_active_idx ON mm_programs (status, last_run_at);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON mm_programs TO atlas_app;
    GRANT UPDATE ON exchanges TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON mm_programs TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mm_programs")
    op.execute("ALTER TABLE exchanges DROP COLUMN IF EXISTS max_listings")
    op.execute("ALTER TABLE exchanges DROP COLUMN IF EXISTS listing_fee")
    op.execute("ALTER TABLE exchanges DROP COLUMN IF EXISTS fee_bps")
