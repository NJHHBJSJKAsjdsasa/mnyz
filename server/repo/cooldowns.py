"""Cooldown rows; claiming is a single conditional upsert (no read-then-write)."""

from __future__ import annotations


def claim(conn, player_id: str, key: str, seconds: int):
    """Return the new ``ready_at`` or ``None`` when still cooling down."""
    return conn.execute(
        """
        INSERT INTO cooldowns (player_id, key, ready_at)
        VALUES (%s, %s, now() + make_interval(secs => %s))
        ON CONFLICT (player_id, key) DO UPDATE
           SET ready_at = EXCLUDED.ready_at, updated_at = now()
         WHERE cooldowns.ready_at <= now()
        RETURNING ready_at
        """,
        (player_id, key, seconds),
    ).fetchone()


def ready_at(conn, player_id: str, key: str):
    row = conn.execute(
        "SELECT ready_at FROM cooldowns WHERE player_id = %s AND key = %s AND ready_at > now()",
        (player_id, key),
    ).fetchone()
    return row["ready_at"] if row else None


def pending(conn, player_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT key, ready_at FROM cooldowns
         WHERE player_id = %s AND ready_at > now()
         ORDER BY ready_at
        """,
        (player_id,),
    ).fetchall()
