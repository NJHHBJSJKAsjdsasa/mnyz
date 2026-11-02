"""reverse-split cash for fractions, and a partitioned candle archive

Revision ID: 0126_split_cold
Revises: 0125_broker_venue
Create Date: 2026-10-28

Design references: docs/cosmic-economy/05 §7（并股碎股）, 07 §4（归档分区与冷备）.

Scope
-----
* ``stock_splits`` records how much cash was paid for fractional shares and how
  many holders were rounded down, so a reverse split stays auditable;
* ``stock_candle_archive`` becomes a monthly RANGE-partitioned table, and
  ``candle_archive_partitions`` tracks which partitions exist and whether one
  has been detached as a cold copy.
"""

from __future__ import annotations

from alembic import op

revision = "0126_split_cold"
down_revision = "0125_broker_venue"
branch_labels = None
depends_on = None


SPLIT_COLUMNS = """
ALTER TABLE stock_splits
  ADD COLUMN cash_in_lieu numeric(30,4) NOT NULL DEFAULT 0 CHECK (cash_in_lieu >= 0);
ALTER TABLE stock_splits
  ADD COLUMN holders_rounded integer NOT NULL DEFAULT 0 CHECK (holders_rounded >= 0);
"""

PARTITIONED = """
ALTER TABLE stock_candle_archive RENAME TO stock_candle_archive_legacy;

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
) PARTITION BY RANGE (bucket_start);

CREATE TABLE candle_archive_partitions (
  partition_name text PRIMARY KEY,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'hot' CHECK (state IN ('hot','cold')),
  row_count bigint NOT NULL DEFAULT 0,
  detached_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
"""

# One partition per calendar month, from 24 months back (or the oldest archived
# row, whichever is earlier) through three months ahead. Boundaries are anchored
# at UTC midnight so the grid does not shift with the session time zone (the app
# connects with ``SET TIME ZONE 'UTC'``, alembic does not).
MAKE_PARTITIONS = """
DO $$
DECLARE
  start_month date;
  stop_month date;
  cursor_month date;
BEGIN
  stop_month := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '4 months')::date;
  SELECT COALESCE(date_trunc('month', MIN(bucket_start) AT TIME ZONE 'UTC')::date,
                  date_trunc('month', now() AT TIME ZONE 'UTC')::date)
    INTO start_month FROM stock_candle_archive_legacy;
  start_month := LEAST(start_month,
                       (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '24 months')::date);
  cursor_month := start_month;
  WHILE cursor_month < stop_month LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF stock_candle_archive '
      'FOR VALUES FROM (%L) TO (%L)',
      'stock_candle_archive_' || to_char(cursor_month, 'YYYYMM'),
      cursor_month::timestamp AT TIME ZONE 'UTC',
      (cursor_month + interval '1 month')::timestamp AT TIME ZONE 'UTC'
    );
    INSERT INTO candle_archive_partitions (partition_name, range_start, range_end)
    VALUES ('stock_candle_archive_' || to_char(cursor_month, 'YYYYMM'),
            cursor_month::timestamp AT TIME ZONE 'UTC',
            (cursor_month + interval '1 month')::timestamp AT TIME ZONE 'UTC')
    ON CONFLICT (partition_name) DO NOTHING;
    cursor_month := (cursor_month + interval '1 month')::date;
  END LOOP;
END $$;

INSERT INTO stock_candle_archive
  (listing_id, interval, bucket_start, open, high, low, close, volume, quote_volume,
   trades, archived_at)
SELECT listing_id, interval, bucket_start, open, high, low, close, volume, quote_volume,
       trades, archived_at
  FROM stock_candle_archive_legacy;

DROP TABLE stock_candle_archive_legacy;

CREATE INDEX candle_archive_time_idx ON stock_candle_archive (bucket_start DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON candle_archive_partitions TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON candle_archive_partitions TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(SPLIT_COLUMNS)
    op.execute(PARTITIONED)
    op.execute(MAKE_PARTITIONS)
    op.execute(GRANTS)


def downgrade() -> None:
    # Put the archive back into a single table before the partition bookkeeping goes.
    op.execute("ALTER TABLE stock_candle_archive RENAME TO stock_candle_archive_part")
    op.execute(
        """
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
        )
        """
    )
    op.execute(
        "INSERT INTO stock_candle_archive SELECT * FROM stock_candle_archive_part "
        "ON CONFLICT DO NOTHING"
    )
    op.execute("DROP TABLE stock_candle_archive_part")
    op.execute("DROP TABLE IF EXISTS candle_archive_partitions")
    op.execute("CREATE INDEX candle_archive_time_idx ON stock_candle_archive (bucket_start DESC)")
    op.execute("ALTER TABLE stock_splits DROP COLUMN IF EXISTS holders_rounded")
    op.execute("ALTER TABLE stock_splits DROP COLUMN IF EXISTS cash_in_lieu")
