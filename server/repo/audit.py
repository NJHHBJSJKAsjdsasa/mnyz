"""Append-only audit trail (the DB role cannot UPDATE/DELETE it)."""

from __future__ import annotations

import json
from dataclasses import dataclass


@dataclass(frozen=True)
class AuditEvent:
    action: str
    actor: str | None = None
    target: str | None = None
    before: dict | None = None
    after: dict | None = None
    ip: str | None = None
    request_id: str | None = None


def write(conn, event: AuditEvent) -> None:
    conn.execute(
        """
        INSERT INTO audit_log (actor, action, target, before, after, ip, request_id)
        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
        """,
        (
            event.actor,
            event.action,
            event.target,
            json.dumps(event.before) if event.before is not None else None,
            json.dumps(event.after, default=str) if event.after is not None else None,
            event.ip,
            event.request_id,
        ),
    )
