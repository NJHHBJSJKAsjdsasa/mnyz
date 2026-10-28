"""share splits and candle archiving

Revision ID: 0124_split_archive
Revises: 0123_exchange_matching
Create Date: 2026-10-28

Design references: docs/cosmic-economy/05 §7 (拆股复权), 07 §4 (K 线归档).

Scope
-----
* ``stock_splits`` records every split so a price history can be readjusted later;
* ``stock_candle_archive`` mirrors the hot candle table: intraday buckets older
  than the retention window are moved here, keeping the hot table small without
  losing history.
"""

from __future__ import annotations

from alembic import op

revision = "0124_split_archive"
down_revision = "0123_exchange_matching"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE stock_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  ratio numeric(12,6) NOT NULL CHECK (ratio > 0),
  executed_by uuid REFERENCES economic_actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_split_listing_idx ON stock_splits (listing_id, created_at DESC);

CREATE TABLE stock_candle_archive (
  listing_id uuid NOT NULL REFERENCES stock_listings(id) ON DELETE CASCADE,
  interval text NOT NULL,
  bucket_start timestamptz NOT NULL,
  open numeric(30,4) NOT NULL,
  high numeric(30,4) NOT NULL,
  low numeric(30,4) NOT NULL,
  close numeric(30,4) NOT NULL,
  volume bigint NOT NULL DEFAULT 0,
  quote_volume numeric(30,4) NOT NULL DEFAULT 0,
  trades integer NOT NULL DEFAULT 0,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, interval, bucket_start)
);
CREATE INDEX candle_archive_time_idx ON stock_candle_archive (bucket_start DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stock_splits, stock_candle_archive TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON stock_splits, stock_candle_archive TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLES)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS stock_candle_archive")
    op.execute("DROP TABLE IF EXISTS stock_splits")
