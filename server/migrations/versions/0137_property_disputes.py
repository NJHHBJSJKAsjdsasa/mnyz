"""property disputes and the 24h contest window (T-18)

A settled sale used to be final. 04 §5 gives the parties one day to contest it;
while a case is open the deed must not be listable, biddable or sellable.

The freeze itself is *not* a new status machine: it is an ordinary
``property_encumbrances(kind='dispute')`` plus ``property_assets.status='frozen'``,
which is exactly what ``property_service.buy`` and ``list_asset`` already check.
This table is only the case record.

``encumbrance_id`` is kept so resolving or expiring a case can release the exact
row it created — releasing "whatever is open on the asset" would also drop a
bank's ``lien``.
"""

from __future__ import annotations

from alembic import op

revision = "0137_property_disputes"
down_revision = "0136_resolution_kinds"
branch_labels = None
depends_on = None


TABLE = """
CREATE TABLE property_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES property_assets(id) ON DELETE CASCADE,
  transfer_id uuid REFERENCES property_transfers(id) ON DELETE SET NULL,
  opened_by uuid NOT NULL REFERENCES economic_actors(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','upheld','rejected','expired')),
  encumbrance_id uuid REFERENCES property_encumbrances(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution_note text NOT NULL DEFAULT ''
);
CREATE INDEX property_dispute_open_idx ON property_disputes (status, closes_at);
CREATE INDEX property_dispute_asset_idx ON property_disputes (asset_id, opened_at DESC);
"""

GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    GRANT SELECT, INSERT, UPDATE ON property_disputes TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    GRANT SELECT ON property_disputes TO atlas_readonly;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS property_disputes")
