"""Transactional outbox: written in the same tx as the business change."""

from __future__ import annotations

import json


def add(conn, *, aggregate_type: str, aggregate_id: str, event_type: str, payload: dict) -> int:
    row = conn.execute(
        """
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (%s, %s, %s, %s::jsonb)
        RETURNING id
        """,
        (aggregate_type, aggregate_id, event_type, json.dumps(payload)),
    ).fetchone()
    return int(row["id"])


def pending(conn, limit: int = 100) -> list[dict]:
    return conn.execute(
        """
        SELECT id, aggregate_type, aggregate_id, event_type, payload, retry_count
          FROM outbox_events
         WHERE published_at IS NULL
         ORDER BY id
         LIMIT %s
         FOR UPDATE SKIP LOCKED
        """,
        (limit,),
    ).fetchall()


def mark_published(conn, event_id: int) -> None:
    conn.execute("UPDATE outbox_events SET published_at = now() WHERE id = %s", (event_id,))


def bump_retry(conn, event_id: int) -> None:
    conn.execute("UPDATE outbox_events SET retry_count = retry_count + 1 WHERE id = %s", (event_id,))


def backlog(conn) -> dict:
    return conn.execute(
        """
        SELECT count(*) AS n, COALESCE(max(now() - created_at), interval '0') AS oldest
          FROM outbox_events WHERE published_at IS NULL
        """
    ).fetchone()
