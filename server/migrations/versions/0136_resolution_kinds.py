"""capital reduction resolution (T-16)

``resolutions.kind`` listed buyback/issuance but not reduction, so the governance
side could not even record the motion the money side now implements. The list also
gains ``merger`` and ``tender`` so the next slice (M&A) does not need another
migration just to store the resolution.
"""

from __future__ import annotations

from alembic import op

revision = "0136_resolution_kinds"
down_revision = "0135_ipo_auction"
branch_labels = None
depends_on = None


UPGRADE = """
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'resolutions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%charter_amendment%'
  LOOP
    EXECUTE format('ALTER TABLE resolutions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE resolutions
  ADD CONSTRAINT resolutions_kind_check
  CHECK (kind IN ('charter_amendment','officer_appointment','dividend','buyback','issuance',
                  'reduction','merger','tender','related_party','dissolution','other'));
"""

DOWNGRADE = """
ALTER TABLE resolutions DROP CONSTRAINT IF EXISTS resolutions_kind_check;
ALTER TABLE resolutions
  ADD CONSTRAINT resolutions_kind_check
  CHECK (kind IN ('charter_amendment','officer_appointment','dividend','buyback','issuance',
                  'related_party','dissolution','other'));
"""


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    op.execute(DOWNGRADE)
