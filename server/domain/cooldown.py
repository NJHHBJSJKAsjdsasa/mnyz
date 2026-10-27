"""Cooldown claim + remaining-time helpers.

A missing row means "available"; the insert-or-conditional-update keeps that
true without a read-then-write race (docs/server/06 §2.4).
"""

from __future__ import annotations

from datetime import datetime

from ..infra.clock import ms_until, now
from ..infra.errors import Cooldown
from ..repo import cooldowns as cooldown_repo


def claim(conn, player_id: str, key: str, seconds: int) -> datetime:
    row = cooldown_repo.claim(conn, player_id, key, seconds)
    if row:
        return row["ready_at"]
    ready = cooldown_repo.ready_at(conn, player_id, key)
    raise Cooldown(ms_until(ready) if ready else seconds * 1000)


def pending_ms(conn, player_id: str) -> dict[str, int]:
    reference = now()
    return {row["key"]: ms_until(row["ready_at"], reference) for row in cooldown_repo.pending(conn, player_id)}


def ready_in_ms(ready_at: datetime) -> int:
    return ms_until(ready_at)
