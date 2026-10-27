"""Single source of time for the server.

The database clock is authoritative for business decisions (cooldowns,
expiry, settlement). ``now()`` is only for computation, logs and ETags, and is
injectable so tests can pin it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

_override: Callable[[], datetime] | None = None


def now() -> datetime:
    if _override is not None:
        return _override()
    return datetime.now(timezone.utc)


def set_now(provider: Callable[[], datetime] | None) -> None:
    """Test hook: pin the application clock (``None`` restores real time)."""
    global _override
    _override = provider


def db_now(conn) -> datetime:
    """Transaction-consistent timestamp straight from PostgreSQL."""
    row = conn.execute("SELECT now() AS ts").fetchone()
    return row["ts"]


def iso(value: datetime | None = None) -> str:
    moment = value or now()
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def ms_until(target: datetime, reference: datetime | None = None) -> int:
    base = reference or now()
    return max(0, int((target - base).total_seconds() * 1000))
