"""Response serialisation helpers (10 §P1-4, 12 §G).

Two rules, applied at the API boundary rather than deep in the domain:

* **Timestamps are ISO-8601 in UTC with a ``Z`` suffix**, millisecond precision.
  PostgreSQL hands back ``+00:00``; ``datetime.isoformat()`` on a naive value
  hands back *no* offset at all, and a browser parses those two strings
  differently. ``ts()`` collapses both to one shape and tolerates ``None`` (which
  ``iso()`` does not — it would substitute "now").
* **Money is a decimal string**. Floats are never correct for balances, and
  ``str(Decimal)`` is already the convention in ``stocks``; this is the helper the
  remaining blueprints migrate onto. It does **not** re-scale: rounding already
  happens in ``currency_service.q4`` / ``ledger``, and quantising twice would
  silently change amounts.

Not every field should go through here: a ``date`` (Game day, billing period) is
serialised with ``.isoformat()`` on purpose — it has no time and no zone.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from .clock import iso

def ts(value: datetime | date | None) -> str | None:
    """UTC ISO-8601 with ``Z``, or ``None`` when the column is null.

    A naive datetime is read as UTC, not as local time: every timestamp column in
    this schema is ``timestamptz``, so a naive value can only come from a test
    fixture or a ``timestamp`` column, and guessing the server's zone for it
    would make responses depend on where the process runs.
    """
    if value is None:
        return None
    if not isinstance(value, datetime):
        # A plain date has no time and no zone; ``iso()`` would need a datetime.
        return value.isoformat()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return iso(value)


def day(value: date | None) -> str | None:
    """A calendar day (no time, no zone)."""
    if value is None:
        return None
    return value.isoformat()


def money(value: Decimal | int | float | str | None) -> str | None:
    """Decimal string exactly as stored; ``None`` stays ``None``."""
    if value is None:
        return None
    return str(Decimal(str(value)))
