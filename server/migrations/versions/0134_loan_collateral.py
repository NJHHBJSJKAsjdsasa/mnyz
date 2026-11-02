"""loan collateral pledge and liquidation (T-13 steps 2–4)

``bank_loans`` had no way to say *what* secures a loan: the only collateral
column in the schema is free text on ``interbank_loans``. So the delinquency
ladder could reach ``defaulted`` and then nothing happened — there was nothing
to seize.

This table is the missing link:

* one row per pledged ``property_assets`` — the unique key is
  ``(loan_id, asset_id)`` so the same deed cannot secure two loans;
* ``pledged_value`` is the appraisal captured **at pledge time**. Re-appraising
  later must not silently change the cover ratio of an existing loan;
* ``status`` walks ``pledged → seized → sold`` (or ``released`` when the loan is
  repaid), and ``listing_id`` points at the liquidation auction, which is how the
  auction settlement finds its way back to the loan.

The lien itself lives in ``property_encumbrances`` (kind ``lien``), because that
is the table ``property_service.buy`` already checks before transferring a deed.
"""

from __future__ import annotations

from alembic import op

revision = "0134_loan_collateral"
down_revision = "0133_planet_visits"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE bank_loan_collateral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES bank_loans(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES property_assets(id) ON DELETE RESTRICT,
  pledged_value numeric(30,4) NOT NULL CHECK (pledged_value > 0),
  status text NOT NULL DEFAULT 'pledged'
    CHECK (status IN ('pledged','seized','sold','released')),
  listing_id uuid REFERENCES property_listings(id) ON DELETE SET NULL,
  encumbrance_id uuid REFERENCES property_encumbrances(id) ON DELETE SET NULL,
  seized_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, asset_id)
);
CREATE INDEX loan_collateral_loan_idx ON bank_loan_collateral (loan_id, status);
CREATE INDEX loan_collateral_listing_idx ON bank_loan_collateral (listing_id);
CREATE INDEX loan_collateral_asset_idx ON bank_loan_collateral (asset_id, status);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE ON bank_loan_collateral TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON bank_loan_collateral TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_loan_collateral")
