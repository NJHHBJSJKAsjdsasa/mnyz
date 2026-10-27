"""Codex entries (planet / element / lifeform discoveries)."""

from __future__ import annotations


def add_many(conn, player_id: str, kind: str, keys: list[str]) -> int:
    added = 0
    for key in keys:
        row = conn.execute(
            """
            INSERT INTO codex_entries (player_id, kind, entry_key)
            VALUES (%s, %s, %s)
            ON CONFLICT (player_id, kind, entry_key) DO NOTHING
            RETURNING entry_key
            """,
            (player_id, kind, key),
        ).fetchone()
        added += 1 if row else 0
    return added


def list_entries(conn, player_id: str, kind: str | None = None, limit: int = 200) -> list[dict]:
    if kind:
        return conn.execute(
            """
            SELECT kind, entry_key, discovered_at FROM codex_entries
             WHERE player_id = %s AND kind = %s
             ORDER BY discovered_at DESC LIMIT %s
            """,
            (player_id, kind, limit),
        ).fetchall()
    return conn.execute(
        """
        SELECT kind, entry_key, discovered_at FROM codex_entries
         WHERE player_id = %s ORDER BY discovered_at DESC LIMIT %s
        """,
        (player_id, limit),
    ).fetchall()
