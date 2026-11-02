"""Domain events: publish inside the caller's transaction (sync return).

Rules (docs/architecture/module-dependencies.md §5):

* ``publish`` never opens a transaction and never commits — it runs on the
  caller's ``conn``, so the row disappears together with a rolled-back change.
* The payload is small on purpose: ids, codes and amounts. Consumers that need
  detail call the owning module's read API; an event is a notification, not a
  denormalised copy of the database.
* Delivery is a later step. Today the log is read by ``GET /events`` only.
"""

from __future__ import annotations

from ..infra.serialize import ts
from ..infra.context import request_id
from ..repo import events as event_repo

# Kept as constants so a typo fails at review time, not in production.
STOCK_SPLIT = "stock.split"
STOCK_DIVIDEND = "stock.dividend"
STOCK_IPO = "stock.ipo"
EXCHANGE_CREATED = "exchange.created"
COURT_JUDGMENT = "court.judgment"
INSOLVENCY_OPENED = "insolvency.opened"


def publish(conn, *, type: str, aggregate: str, payload: dict,  # noqa: A002
            actor_id: str | None = None) -> int:
    return event_repo.append(
        conn,
        type=type,
        aggregate=aggregate,
        payload=payload,
        actor_id=actor_id,
        request_id=request_id(),
    )


def stream(conn, *, since: int = 0, types: list[str] | None = None,
           aggregate: str | None = None, limit: int = 100) -> dict:
    limit = max(1, min(int(limit), 500))
    rows = event_repo.after(conn, since=since, types=types, aggregate=aggregate, limit=limit)
    return {
        "events": [
            {
                "seq": int(row["seq"]),
                "type": row["type"],
                "aggregate": row["aggregate"],
                "actor_id": str(row["actor_id"]) if row["actor_id"] else None,
                "payload": row["payload"],
                "created_at": ts(row["created_at"]),
            }
            for row in rows
        ],
        "next_since": int(rows[-1]["seq"]) if rows else int(since),
    }
