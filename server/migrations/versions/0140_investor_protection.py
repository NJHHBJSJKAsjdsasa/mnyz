"""investor protection fund claims (T-23)

05 §11 already sends 20 % of every stock fee to ``insurance_fund``; what was
missing is the reason that account exists. This table is the claim window: an
investor who lost money to a firm default, a settlement failure or a proven fraud
files a claim, CCMC approves it, and the fund pays out of the 20 % it collected.

Two guards keep the fund from becoming a money printer:

* **one open claim per actor** (partial unique index) — a player cannot stack
  fifty pending claims against the same account;
* **a per-claim cap** (``MAX_PAYOUT`` in the domain, 1 万) — the same number the
  deposit-insurance module uses, because both are "small investor" backstops, and
  a claim larger than the cap is still recorded, just paid up to the cap.

Statuses: ``pending`` → ``approved`` (paid in full) / ``partial`` (fund ran dry) /
``rejected``. ``paid`` lives in ``paid_amount``; the status says whether the
decision has been made, not how much came out.
"""

from __future__ import annotations

from alembic import op

revision = "0140_investor_protection"
down_revision = "0139_delisting_consolidation"
branch_labels = None
depends_on = None


DDL = """
CREATE TABLE investor_protection_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_actor_id uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('firm_default','settlement_failure','fraud')),
  currency_code text NOT NULL REFERENCES currencies(code),
  claimed_amount numeric(30,4) NOT NULL CHECK (claimed_amount > 0),
  paid_amount numeric(30,4) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','partial','rejected')),
  reason text NOT NULL DEFAULT '',
  ref_type text,
  ref_id text,
  reviewed_by text NOT NULL DEFAULT '',
  review_note text NOT NULL DEFAULT '',
  tx_id uuid REFERENCES currency_ledger_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX investor_claim_one_open_idx
  ON investor_protection_claims (claimant_actor_id) WHERE status = 'pending';
CREATE INDEX investor_claim_status_idx
  ON investor_protection_claims (status, created_at DESC);
CREATE INDEX investor_claim_actor_idx
  ON investor_protection_claims (claimant_actor_id, created_at DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE ON investor_protection_claims TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON investor_protection_claims TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(DDL)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS investor_protection_claims")
