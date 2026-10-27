"""Player-owned planet data (claims, structures, deposits, audit)."""

from __future__ import annotations

import json


def claim(conn, player_id: str, planet_key: str) -> bool:
    row = conn.execute(
        """
        INSERT INTO planet_claims (player_id, planet_key) VALUES (%s, %s)
        ON CONFLICT (player_id, planet_key) DO NOTHING
        RETURNING planet_key
        """,
        (player_id, planet_key.lower()),
    ).fetchone()
    return bool(row)


def claimed(conn, player_id: str, planet_key: str) -> bool:
    row = conn.execute(
        "SELECT 1 AS hit FROM planet_claims WHERE player_id = %s AND planet_key = %s",
        (player_id, planet_key.lower()),
    ).fetchone()
    return bool(row)


def claim_count(conn, player_id: str) -> int:
    row = conn.execute(
        "SELECT count(*) AS n FROM planet_claims WHERE player_id = %s", (player_id,)
    ).fetchone()
    return int(row["n"])


def structures(conn, player_id: str, planet_key: str) -> list[dict]:
    return conn.execute(
        """
        SELECT structure_code, level FROM planet_structures
         WHERE player_id = %s AND planet_key = %s ORDER BY built_at
        """,
        (player_id, planet_key.lower()),
    ).fetchall()


def upsert_structure(conn, player_id: str, planet_key: str, code: str, level: int) -> None:
    conn.execute(
        """
        INSERT INTO planet_structures (player_id, planet_key, structure_code, level)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (player_id, planet_key, structure_code)
        DO UPDATE SET level = EXCLUDED.level, updated_at = now()
        """,
        (player_id, planet_key.lower(), code, level),
    )


def deposits(conn, player_id: str, planet_key: str) -> list[dict]:
    return conn.execute(
        """
        SELECT resource_code, amount FROM planet_deposits
         WHERE player_id = %s AND planet_key = %s AND amount > 0
         ORDER BY resource_code
        """,
        (player_id, planet_key.lower()),
    ).fetchall()


def add_deposit(conn, player_id: str, planet_key: str, code: str, amount: int) -> None:
    conn.execute(
        """
        INSERT INTO planet_deposits (player_id, planet_key, resource_code, amount)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (player_id, planet_key, resource_code)
        DO UPDATE SET amount = planet_deposits.amount + EXCLUDED.amount, updated_at = now()
        """,
        (player_id, planet_key.lower(), code, amount),
    )


def clear_deposits(conn, player_id: str, planet_key: str) -> None:
    conn.execute(
        "DELETE FROM planet_deposits WHERE player_id = %s AND planet_key = %s",
        (player_id, planet_key.lower()),
    )


def audit(conn, player_id: str | None, planet_key: str, action: str, before: dict | None, after: dict | None) -> None:
    conn.execute(
        """
        INSERT INTO planet_audit (player_id, planet_key, action, before, after)
        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb)
        """,
        (
            player_id,
            planet_key.lower(),
            action,
            json.dumps(before, default=str) if before is not None else None,
            json.dumps(after, default=str) if after is not None else None,
        ),
    )


def event(conn, planet_key: str, event_type: str, payload: dict) -> None:
    conn.execute(
        """
        INSERT INTO planet_events (planet_key, event_type, payload)
        VALUES (%s, %s, %s::jsonb)
        """,
        (planet_key.lower(), event_type, json.dumps(payload, default=str)),
    )
