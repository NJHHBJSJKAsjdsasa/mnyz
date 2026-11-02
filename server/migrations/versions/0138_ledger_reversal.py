"""ledger reversals: correcting entries instead of editing them (T-32, 12 §5)

01 §2 says the ledger is append-only. Before this revision the only way to fix a
wrong posting was to post a *new* transaction with no link back to the original,
so an auditor could see "something moved" but not "this corrects that".

Two columns are enough:

* ``reversal_of`` — the transaction this row mirrors (null for ordinary entries);
* ``reversal_reason`` — why, copied into the row so the *ledger* carries the
  explanation, not only ``audit_log``.

The partial unique index is the invariant that matters: **a transaction may be
reversed at most once.** Reversing the reversal ("redo") is a normal operation
and works because it targets the reversal row, which has its own slot.

Whether the original's effect currently stands is *derived* (count the
descendants; even = applied, odd = reverted). Storing a boolean would let the
flag and the rows disagree after a redo — the rows are the only truth.
"""

from __future__ import annotations

from alembic import op

revision = "0138_ledger_reversal"
down_revision = "0137_property_disputes"
branch_labels = None
depends_on = None


DDL = """
ALTER TABLE currency_ledger_transactions
  ADD COLUMN IF NOT EXISTS reversal_of uuid
    REFERENCES currency_ledger_transactions(id),
  ADD COLUMN IF NOT EXISTS reversal_reason text NOT NULL DEFAULT '';

ALTER TABLE currency_ledger_transactions
  ADD CONSTRAINT currency_tx_reversal_kind_chk
    CHECK (reversal_of IS NULL OR kind = 'reversal'),
  ADD CONSTRAINT currency_tx_reversal_self_chk
    CHECK (reversal_of IS NULL OR reversal_of <> id);

CREATE UNIQUE INDEX currency_tx_one_reversal_idx
  ON currency_ledger_transactions (reversal_of)
  WHERE reversal_of IS NOT NULL;
"""


def upgrade() -> None:
    op.execute(DDL)


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS currency_tx_one_reversal_idx;
        ALTER TABLE currency_ledger_transactions
          DROP CONSTRAINT IF EXISTS currency_tx_reversal_self_chk,
          DROP CONSTRAINT IF EXISTS currency_tx_reversal_kind_chk,
          DROP COLUMN IF EXISTS reversal_reason,
          DROP COLUMN IF EXISTS reversal_of;
        """
    )
