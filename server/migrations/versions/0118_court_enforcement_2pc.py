"""court recognition: 2PC-gated enforcement and conflict detection

Revision ID: 0118_court_enforcement_2pc
Revises: 0117_court_recognition
Create Date: 2026-10-27

Design references: docs/cosmic-economy/08 §8 / §12.3, 09 §3/§8.

Scope
-----
* ``court_recognition.dt_tx_id`` — cross-region enforcement now goes through the
  2PC coordinator (``kind='court_enforcement'``), so the asset movement is
  recorded in the distributed-transaction log instead of a bare local transfer;
* ``court_recognition.conflict_with`` — when two contradictory judgments between
  the same pair are recognized in the same region, the second one records which
  judgment it conflicts with instead of silently overriding it.
"""

from __future__ import annotations

from alembic import op

revision = "0118_court_enforcement_2pc"
down_revision = "0117_court_recognition"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE court_recognition
          ADD COLUMN dt_tx_id uuid REFERENCES distributed_transactions(id) ON DELETE SET NULL,
          ADD COLUMN conflict_with uuid REFERENCES court_recognition(id) ON DELETE SET NULL;

        CREATE INDEX recognition_conflict_idx ON court_recognition (conflict_with)
          WHERE conflict_with IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS recognition_conflict_idx")
    op.execute("ALTER TABLE court_recognition DROP COLUMN IF EXISTS conflict_with")
    op.execute("ALTER TABLE court_recognition DROP COLUMN IF EXISTS dt_tx_id")
