"""multi-currency liquidation accounting

Revision ID: 0122_liquidation_fx
Revises: 0121_court_panel
Create Date: 2026-10-27

Design references: docs/cosmic-economy/08 §6.6, 0114 known gap.

Claims stay denominated in the settlement currency (``cc4``), but a company may
hold any tier. ``paid_q1`` records what was actually distributed in Q1 value, so a
claim paid out of several currencies can be reconciled against one number.
"""

from __future__ import annotations

from alembic import op

revision = "0122_liquidation_fx"
down_revision = "0121_court_panel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE insolvency_claims
          ADD COLUMN paid_q1 numeric(30,4) NOT NULL DEFAULT 0 CHECK (paid_q1 >= 0);
        COMMENT ON COLUMN insolvency_claims.paid_q1 IS
          'Q1-equivalent value actually paid; paid stays in the claim currency';
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE insolvency_claims DROP COLUMN IF EXISTS paid_q1")
