"""economy: wallets, system accounts, double-entry ledger (partitioned)

Revision ID: 0003_economy
Revises: 0002_reference
Create Date: 2026-10-25
"""

from __future__ import annotations

from datetime import date

from alembic import op

revision = "0003_economy"
down_revision = "0002_reference"
branch_labels = None
depends_on = None

PARTITION_MONTHS = 4


def _months(start: date, count: int) -> list[date]:
    months: list[date] = []
    year, month = start.year, start.month
    for _ in range(count):
        months.append(date(year, month, 1))
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return months


def _partition_sql() -> str:
    today = date.today()
    start_month = (today.year, today.month - 1)
    if start_month[1] == 0:
        start_month = (today.year - 1, 12)
    first = date(start_month[0], start_month[1], 1)
    statements: list[str] = []
    for month in _months(first, PARTITION_MONTHS):
        next_year, next_month = (month.year + 1, 1) if month.month == 12 else (month.year, month.month + 1)
        name = f"ledger_entries_{month:%Y_%m}"
        statements.append(
            f"CREATE TABLE IF NOT EXISTS {name} PARTITION OF ledger_entries "
            f"FOR VALUES FROM ('{month:%Y-%m-%d}') TO ('{next_year:04d}-{next_month:02d}-01');"
        )
    return "\n".join(statements)


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE wallets (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resource_code text NOT NULL REFERENCES resource_types(code),
  balance numeric(20,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, resource_code)
);

CREATE TABLE system_accounts (
  code text PRIMARY KEY,
  description text
);

INSERT INTO system_accounts (code, description) VALUES
  ('loot', '采集/扫描/打捞/战利品来源'),
  ('quest', '合同与任务奖励'),
  ('market', '市场买卖对手'),
  ('sink', '改装/科技/维修/建站消耗'),
  ('escrow', '攻城与跨区暂存'),
  ('migration', '存档导入来源')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_type text,
  ref_id text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_tx_player_idx ON ledger_transactions (player_id, created_at DESC);
CREATE INDEX ledger_tx_kind_idx ON ledger_transactions (kind, created_at DESC);

CREATE TABLE ledger_entries (
  id bigserial,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  wallet_id uuid,
  system_account_code text REFERENCES system_accounts(code),
  resource_code text NOT NULL REFERENCES resource_types(code),
  delta numeric(20,4) NOT NULL CHECK (delta <> 0),
  balance_after numeric(20,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_party_exclusive CHECK ((wallet_id IS NULL) <> (system_account_code IS NULL))
) PARTITION BY RANGE (created_at);
CREATE INDEX ledger_entries_tx_idx ON ledger_entries (transaction_id);
CREATE INDEX ledger_entries_wallet_idx ON ledger_entries (wallet_id, created_at);
"""
    )
    op.execute(_partition_sql())
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON wallets, system_accounts, ledger_transactions TO atlas_app;
    GRANT SELECT, INSERT ON ledger_entries TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE ledger_entries_id_seq TO atlas_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON wallets, system_accounts, ledger_transactions, ledger_entries TO atlas_readonly;
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ledger_entries CASCADE")
    op.execute("DROP TABLE IF EXISTS ledger_transactions")
    op.execute("DROP TABLE IF EXISTS system_accounts")
    op.execute("DROP TABLE IF EXISTS wallets")
