"""contracts: store the randomized reward snapshot

Revision ID: 0100b_contract_reward
Revises: 0100_universe_cache
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0100b_contract_reward"
down_revision = "0100_universe_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE contracts ADD COLUMN reward jsonb NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE contracts DROP COLUMN reward")
