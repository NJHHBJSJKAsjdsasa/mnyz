"""revenue collection and fee/tax revenue split

Revision ID: 0119_revenue_split
Revises: 0118_court_enforcement_2pc
Create Date: 2026-10-27

Design references: docs/cosmic-economy/05 §11 (费用 50/30/20), 03 §6.2 (持有税 70/30).

Scope
-----
Fees are still *charged* exactly where they always were (the treasury), so no hot
path changes behaviour. What is new is that each charge also lands in
``revenue_collections``; a split run then moves the configured shares out of the
treasury into the beneficiary accounts.

The split is deliberately asynchronous: if it fails or is skipped, the money is
simply still sitting in the treasury, which is the pre-0119 behaviour and never
an inconsistent state.
"""

from __future__ import annotations

from alembic import op

revision = "0119_revenue_split"
down_revision = "0118_court_enforcement_2pc"
branch_labels = None
depends_on = None


TABLES = """
CREATE TABLE revenue_split_rules (
  kind text PRIMARY KEY,
  label text NOT NULL,
  currency_code text NOT NULL REFERENCES currencies(code),
  legs jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE revenue_split_runs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL REFERENCES revenue_split_rules(kind) ON DELETE RESTRICT,
  currency_code text NOT NULL REFERENCES currencies(code),
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  legs jsonb NOT NULL,
  collections integer NOT NULL DEFAULT 0,
  ran_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX revenue_run_kind_idx ON revenue_split_runs (kind, created_at DESC);

CREATE TABLE revenue_collections (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  currency_code text NOT NULL REFERENCES currencies(code),
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  ref_type text,
  ref_id text,
  split_run_id bigint REFERENCES revenue_split_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX revenue_collection_open_idx ON revenue_collections (kind, split_run_id)
  WHERE split_run_id IS NULL;
CREATE INDEX revenue_collection_time_idx ON revenue_collections (created_at DESC);

"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      revenue_split_rules, revenue_split_runs, revenue_collections TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE revenue_split_runs_id_seq,
      revenue_collections_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON revenue_split_rules, revenue_split_runs, revenue_collections
      TO atlas_readonly;
  END IF;
END $$;
"""


SEED = """
INSERT INTO revenue_split_rules (kind, label, currency_code, legs) VALUES
  ('stock_fee', '股票手续费与印花税（交易所/券商/投资者保护）', 'cc4',
   '[{"actor":"market","share":"0.50"},
     {"actor":"officer_pool","share":"0.30"},
     {"actor":"insurance_fund","share":"0.20"}]'::jsonb),
  ('property_tax', '产权持有税（中央/地方）', 'cc1',
   '[{"actor":"treasury","share":"0.70","keep":true},
     {"actor":"market","share":"0.30"}]'::jsonb)
ON CONFLICT (kind) DO NOTHING;
"""


def upgrade() -> None:
    op.execute(TABLES)
    # raw driver call: SQLAlchemy would read the JSON's ``:true`` as a bind param
    op.get_bind().exec_driver_sql(SEED)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS revenue_collections")
    op.execute("DROP TABLE IF EXISTS revenue_split_runs")
    op.execute("DROP TABLE IF EXISTS revenue_split_rules")
