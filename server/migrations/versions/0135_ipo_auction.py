"""IPO council approval and the first-day call auction (T-21).

Two schema facts had to change:

1. ``council_motions.kind`` allowed ``sector_license``/``membership``/
   ``issuance_policy`` — no way to put an IPO before the council, so the only
   path to a listing was ``POST /stocks/ipo`` deciding for itself.
2. ``stock_listings`` had no notion of a pre-open phase. A listing traded
   continuously from the first second, which means the "opening price" was just
   whoever happened to hit the treasury's resting ask first.

``auction_ends_at`` marks the window in which orders are collected but not
matched; ``auction_cleared_at`` records that the single clearing price was struck
(it also makes the clearing job idempotent — the partial index only covers rows
that still need work).
"""

from __future__ import annotations

from alembic import op

revision = "0135_ipo_auction"
down_revision = "0134_loan_collateral"
branch_labels = None
depends_on = None


KINDS = """
DO $$
DECLARE
  c record;
BEGIN
  -- Drop whatever the current kind constraint is called, then re-add with `ipo`.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'council_motions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%sector_license%'
  LOOP
    EXECUTE format('ALTER TABLE council_motions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE council_motions
  ADD CONSTRAINT council_motions_kind_check
  CHECK (kind IN ('sector_license','membership','issuance_policy','ipo'));
"""

AUCTION = """
ALTER TABLE stock_listings ADD COLUMN auction_ends_at timestamptz;
ALTER TABLE stock_listings ADD COLUMN auction_cleared_at timestamptz;
CREATE INDEX stock_listing_auction_idx
    ON stock_listings (auction_ends_at)
 WHERE auction_cleared_at IS NULL AND auction_ends_at IS NOT NULL;
"""


def upgrade() -> None:
    op.execute(KINDS)
    op.execute(AUCTION)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS stock_listing_auction_idx")
    op.execute("ALTER TABLE stock_listings DROP COLUMN IF EXISTS auction_cleared_at")
    op.execute("ALTER TABLE stock_listings DROP COLUMN IF EXISTS auction_ends_at")
    op.execute("ALTER TABLE council_motions DROP CONSTRAINT IF EXISTS council_motions_kind_check")
    op.execute(
        "ALTER TABLE council_motions ADD CONSTRAINT council_motions_kind_check "
        "CHECK (kind IN ('sector_license','membership','issuance_policy'))"
    )
