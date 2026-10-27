"""Codex section completion claims."""

from __future__ import annotations


def claimed(conn, player_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT section FROM codex_claims WHERE player_id = %s ORDER BY claimed_at", (player_id,)
    ).fetchall()
    return [row["section"] for row in rows]


def claim(conn, player_id: str, section: str) -> bool:
    row = conn.execute(
        """
        INSERT INTO codex_claims (player_id, section) VALUES (%s, %s)
        ON CONFLICT (player_id, section) DO NOTHING
        RETURNING section
        """,
        (player_id, section),
    ).fetchone()
    return bool(row)
