"""delisting consolidation, clearing price and liquidation payouts (T-22)

Before this revision a delisting was a dead end: ``trigger_delisting`` suspended
the listing the same minute the trigger fired, and ``settle_delisting`` voided
every share while moving no money — the docstring said the shares "become a
liquidation claim handled by 08", but nothing actually handled it.

05 §7.3 asks for three phases, so the case table gains the clock for them:

``consolidation`` (整理期, 30 days)
    The share keeps trading. This is the point of the phase: holders who do not
    want the liquidation price get 30 days to leave. The listing status stays
    ``listed`` and the halt is cleared.
``auction`` (清算期, 3 days)
    Trading stops. The clearing price is the volume-weighted average of the
    consolidation window — a price the market actually printed, not a number an
    operator types in.
``settled``
    Creditors are paid first (the only creditors the game models are banks), then
    the remaining cash goes pro-rata to shareholders, then the shares are void.

``stock_delisting_payouts`` is the audit trail: one row per creditor or
shareholder, with the ledger ``tx_id`` that moved the money. Without it the
question "who got what when X delisted" needs a ledger join nobody can write.
"""

from __future__ import annotations

from alembic import op

revision = "0139_delisting_consolidation"
down_revision = "0138_ledger_reversal"
branch_labels = None
depends_on = None


DDL = """
ALTER TABLE delisting_cases
  ADD COLUMN IF NOT EXISTS consolidation_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS auction_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS clearing_price numeric(30,4),
  ADD COLUMN IF NOT EXISTS distributed_amount numeric(30,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'cc4';

DO $$
DECLARE
  con text;
BEGIN
  -- The original status check was written inline, so its name is generated.
  SELECT conname INTO con FROM pg_constraint
   WHERE conrelid = 'delisting_cases'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%auction%';
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE delisting_cases DROP CONSTRAINT %I', con);
  END IF;
  ALTER TABLE delisting_cases ADD CONSTRAINT delisting_cases_status_check
    CHECK (status IN ('triggered','consolidation','auction','settled','cancelled'));
END $$;

CREATE TABLE stock_delisting_payouts (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES delisting_cases(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('creditor','shareholder')),
  amount numeric(30,4) NOT NULL CHECK (amount >= 0),
  shares integer NOT NULL DEFAULT 0,
  currency_code text NOT NULL REFERENCES currencies(code),
  ref text NOT NULL DEFAULT '',
  tx_id uuid REFERENCES currency_ledger_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delisting_payout_case_idx ON stock_delisting_payouts (case_id, kind);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT ON stock_delisting_payouts TO atlas_app;
    GRANT USAGE, SELECT ON SEQUENCE stock_delisting_payouts_id_seq TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON stock_delisting_payouts TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(DDL)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS stock_delisting_payouts;
        ALTER TABLE delisting_cases
          DROP CONSTRAINT IF EXISTS delisting_cases_status_check,
          DROP COLUMN IF EXISTS currency_code,
          DROP COLUMN IF EXISTS distributed_amount,
          DROP COLUMN IF EXISTS clearing_price,
          DROP COLUMN IF EXISTS auction_ends_at,
          DROP COLUMN IF EXISTS consolidation_ends_at;
        """
    )
