"""Materialised balances. Only ``domain.ledger`` may change them."""

from __future__ import annotations

from decimal import Decimal


def ensure(conn, player_id: str) -> int:
    rows = conn.execute(
        """
        INSERT INTO wallets (player_id, resource_code)
        SELECT %s, code FROM resource_types
        ON CONFLICT (player_id, resource_code) DO NOTHING
        RETURNING resource_code
        """,
        (player_id,),
    ).fetchall()
    return len(rows)


def balances(conn, player_id: str) -> dict[str, Decimal]:
    rows = conn.execute(
        "SELECT resource_code, balance FROM wallets WHERE player_id = %s", (player_id,)
    ).fetchall()
    return {row["resource_code"]: Decimal(row["balance"]) for row in rows}


def adjust(conn, player_id: str, resource_code: str, delta: Decimal) -> Decimal | None:
    """Conditional update; ``None`` means 'would go negative'."""
    row = conn.execute(
        """
        UPDATE wallets
           SET balance = balance + %s, updated_at = now()
         WHERE player_id = %s AND resource_code = %s AND balance + %s >= 0
        RETURNING balance
        """,
        (delta, player_id, resource_code, delta),
    ).fetchone()
    return Decimal(row["balance"]) if row else None
