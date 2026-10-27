"""Server-issued challenge codes (asynchronous PvP snapshots)."""

from __future__ import annotations

import json


def create(conn, code: str, owner_player_id: str, payload: dict, days: int = 30) -> dict:
    return conn.execute(
        """
        INSERT INTO challenge_codes (code, owner_player_id, payload, expires_at)
        VALUES (%s, %s, %s::jsonb, now() + (%s || ' days')::interval)
        RETURNING code, owner_player_id, payload, expires_at
        """,
        (code, owner_player_id, json.dumps(payload), days),
    ).fetchone()


def get(conn, code: str) -> dict | None:
    return conn.execute(
        """
        SELECT code, owner_player_id, payload, uses, created_at, expires_at
          FROM challenge_codes WHERE code = %s
        """,
        (code,),
    ).fetchone()


def use(conn, code: str) -> bool:
    row = conn.execute(
        """
        UPDATE challenge_codes SET uses = uses + 1
         WHERE code = %s AND expires_at > now()
        RETURNING code
        """,
        (code,),
    ).fetchone()
    return bool(row)
