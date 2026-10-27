"""allow full 256-bit universe seeds (old Atlas sha256 seeds)

Revision ID: 0108_universe_seed_numeric
Revises: 0107_codex_claims
Create Date: 2026-10-26
"""

from __future__ import annotations

from alembic import op

revision = "0108_universe_seed_numeric"
down_revision = "0107_codex_claims"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy Atlas uses int(sha256(seed_str), 16), i.e. up to 78 decimal
    # digits; bigint cannot hold it, and truncating would change every planet.
    op.execute("ALTER TABLE universes ALTER COLUMN seed TYPE numeric(80, 0)")


def downgrade() -> None:
    op.execute("ALTER TABLE universes ALTER COLUMN seed TYPE bigint USING seed::bigint")
