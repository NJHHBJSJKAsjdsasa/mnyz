"""Idempotency bookkeeping (placeholder + business in one transaction)."""

from __future__ import annotations

import json


def claim(conn, *, key: str, account_id: str, route: str, request_hash: str) -> dict | None:
    """Insert a placeholder; return the existing row when the key is taken."""
    inserted = conn.execute(
        """
        INSERT INTO idempotency_keys (key, account_id, route, request_hash)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (key) DO NOTHING
        RETURNING key
        """,
        (key, account_id, route, request_hash),
    ).fetchone()
    if inserted:
        return None
    return conn.execute(
        "SELECT key, account_id, route, request_hash, response, status FROM idempotency_keys WHERE key = %s",
        (key,),
    ).fetchone()


def store(conn, *, key: str, account_id: str, status: int, response: dict) -> None:
    conn.execute(
        """
        UPDATE idempotency_keys SET response = %s::jsonb, status = %s
         WHERE key = %s AND account_id = %s
        """,
        (json.dumps(response, default=str), status, key, account_id),
    )


def cleanup(conn, hours: int = 24, batch: int = 1000) -> int:
    rows = conn.execute(
        """
        DELETE FROM idempotency_keys
         WHERE key IN (
           SELECT key FROM idempotency_keys
            WHERE created_at < now() - make_interval(hours => %s)
            LIMIT %s
         )
        RETURNING key
        """,
        (hours, batch),
    ).fetchall()
    return len(rows)
