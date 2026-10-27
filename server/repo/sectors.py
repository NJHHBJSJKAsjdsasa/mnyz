"""Sector licenses."""

from __future__ import annotations


def list_unlocked(conn, player_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT sector_key FROM sector_licenses WHERE player_id = %s ORDER BY unlocked_at",
        (player_id,),
    ).fetchall()
    return [row["sector_key"] for row in rows]


def count(conn, player_id: str) -> int:
    row = conn.execute(
        "SELECT count(*) AS n FROM sector_licenses WHERE player_id = %s", (player_id,)
    ).fetchone()
    return int(row["n"])


def is_unlocked(conn, player_id: str, sector_key: str) -> bool:
    row = conn.execute(
        "SELECT 1 AS hit FROM sector_licenses WHERE player_id = %s AND sector_key = %s",
        (player_id, sector_key),
    ).fetchone()
    return bool(row)


def insert(conn, player_id: str, sector_key: str) -> bool:
    row = conn.execute(
        """
        INSERT INTO sector_licenses (player_id, sector_key) VALUES (%s, %s)
        ON CONFLICT (player_id, sector_key) DO NOTHING
        RETURNING sector_key
        """,
        (player_id, sector_key),
    ).fetchone()
    return bool(row)
