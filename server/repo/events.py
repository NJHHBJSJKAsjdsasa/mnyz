"""Persistence for ``domain_events`` (append-only)."""

from __future__ import annotations

import json


def append(conn, *, type: str, aggregate: str, payload: dict,  # noqa: A002
           actor_id: str | None, request_id: str = "") -> int:
    row = conn.execute(
        """
        INSERT INTO domain_events (type, aggregate, actor_id, payload, request_id)
        VALUES (%s, %s, %s, %s::jsonb, %s)
        RETURNING seq
        """,
        (type, aggregate, actor_id, json.dumps(payload, ensure_ascii=False), request_id),
    ).fetchone()
    return int(row["seq"])


def after(conn, *, since: int = 0, types: list[str] | None = None,
          aggregate: str | None = None, limit: int = 100) -> list[dict]:
    where = ["seq > %s"]
    params: list = [since]
    if types:
        where.append("type = ANY(%s)")
        params.append(list(types))
    if aggregate:
        where.append("aggregate = %s")
        params.append(aggregate)
    params.append(limit)
    return conn.execute(
        "SELECT seq, type, aggregate, actor_id, payload, request_id, created_at "
        "  FROM domain_events WHERE " + " AND ".join(where) + " ORDER BY seq LIMIT %s",
        tuple(params),
    ).fetchall()
