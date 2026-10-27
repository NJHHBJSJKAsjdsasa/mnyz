"""Collection history; the row count drives the diminishing-return factor."""

from __future__ import annotations

import json


def count_for(conn, player_id: str, planet_key: str) -> int:
    row = conn.execute(
        "SELECT count(*) AS n FROM collections WHERE player_id = %s AND planet_key = %s",
        (player_id, planet_key),
    ).fetchone()
    return int(row["n"])


def insert(conn, player_id: str, planet_key: str, tx_id: str, yield_map: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO collections (player_id, planet_key, tx_id, yield)
        VALUES (%s, %s, %s, %s::jsonb)
        RETURNING id, created_at
        """,
        (player_id, planet_key, tx_id, json.dumps(yield_map)),
    ).fetchone()


def recent(conn, player_id: str, limit: int = 20) -> list[dict]:
    return conn.execute(
        """
        SELECT planet_key, yield, created_at FROM collections
         WHERE player_id = %s ORDER BY created_at DESC LIMIT %s
        """,
        (player_id, limit),
    ).fetchall()
