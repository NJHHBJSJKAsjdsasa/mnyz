"""First-paint aggregates for the shell (10 §P0-5).

This module owns no tables. It is a **composer**: every number comes from the
owning module's read API, so the query lives next to the table it reads and a
schema change breaks exactly one place.

See ``docs/architecture/module-dependencies.md`` for the dependency rule.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from . import bank_service, currency_service, property_service, stock_service
from .currency_service import q4

TAX_STATES = {"due", "overdue"}
LOAN_STATES = {"active", "overdue"}


def wallet_summary(conn, actor_id: str | None) -> dict:
    if not actor_id:
        return {"balances": [], "total_q1": "0.0000"}
    wallet = currency_service.wallet(conn, actor_id)
    return {
        "balances": [
            {
                "currency_code": row["code"],
                "name": row["name"],
                "quality": row["quality"],
                "available": str(Decimal(row["balance"]) - Decimal(row["frozen"])),
                "frozen": row["frozen"],
            }
            for row in wallet["currencies"]
        ],
        "total_q1": wallet["q1_total"],
    }


def portfolio_summary(conn, actor_id: str | None) -> dict:
    if not actor_id:
        return {"positions": 0, "market_value": "0.0000", "unrealized_pnl": "0.0000"}
    book = stock_service.portfolio(conn, {"id": actor_id})
    market_value = sum((Decimal(pos["market_value"]) for pos in book["positions"]), Decimal(0))
    pnl = sum((Decimal(pos["unrealized_pnl"]) for pos in book["positions"]), Decimal(0))
    return {
        "positions": len(book["positions"]),
        "market_value": str(q4(market_value)),
        "unrealized_pnl": str(q4(pnl)),
    }


def obligations(conn, actor_id: str | None, limit: int = 5) -> list[dict]:
    """Upcoming money-out events, soonest first (tax + loan; no court deadline column)."""
    if not actor_id:
        return []
    items: list[dict] = []
    for bill in property_service.bills_of(conn, actor_id):
        if bill["status"] in TAX_STATES:
            items.append(
                {
                    "kind": "tax",
                    "id": bill["id"],
                    "amount": bill["amount"],
                    "currency_code": "cc1",
                    "due_at": bill["due_at"],
                    "ref": bill["asset_key"],
                }
            )
    for loan in bank_service.loans(conn, actor_id):
        if loan["status"] in LOAN_STATES:
            items.append(
                {
                    "kind": "loan",
                    "id": loan["id"],
                    "amount": str(Decimal(loan["outstanding"]) + Decimal(loan["accrued_interest"])),
                    "currency_code": loan["currency_code"],
                    "due_at": loan["due_at"],
                    "ref": loan["bank_id"],
                }
            )
    items.sort(key=lambda item: item["due_at"])
    now = datetime.now(timezone.utc)
    return [
        {**item, "overdue": datetime.fromisoformat(item["due_at"]) < now}
        for item in items[:limit]
    ]
