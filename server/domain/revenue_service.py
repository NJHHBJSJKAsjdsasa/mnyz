"""Fee and tax revenue split (05 §11, 03 §6.2).

Money is charged into the treasury exactly as before; this service only moves the
configured shares out of it. A leg marked ``keep`` stays in the treasury (the
central government share), so a rule can express 70/30 without a self-transfer.
"""

from __future__ import annotations

import json
from decimal import Decimal

from ..infra.errors import InvalidArgument, NotFound, Unprocessable
from ..repo import revenue as revenue_repo
from . import currency_service
from .currency_service import Move, q4


def _legs(rule: dict) -> list[dict]:
    legs = rule["legs"]
    if isinstance(legs, str):
        legs = json.loads(legs)
    return list(legs or [])


def _validate(legs: list[dict]) -> None:
    if not legs:
        raise Unprocessable("分账规则没有分账方")
    total = Decimal(0)
    for leg in legs:
        try:
            share = Decimal(str(leg.get("share")))
        except (TypeError, ValueError):
            raise InvalidArgument("分账比例必须是数字") from None
        if share < 0 or share > 1:
            raise InvalidArgument("分账比例必须在 0-1 之间")
        if not str(leg.get("actor") or "").strip():
            raise InvalidArgument("分账方不能为空")
        total += share
    if abs(total - Decimal(1)) > Decimal("0.0001"):
        raise Unprocessable(f"分账比例之和必须为 1，当前 {q4(total)}")


def rules(conn) -> list[dict]:
    return [
        {
            "kind": row["kind"],
            "label": row["label"],
            "currency_code": row["currency_code"],
            "status": row["status"],
            "legs": _legs(row),
        }
        for row in revenue_repo.rules(conn)
    ]


def summary(conn) -> list[dict]:
    return [
        {
            "kind": row["kind"],
            "pending_count": int(row["pending_count"]),
            "pending_amount": str(Decimal(row["pending_amount"])),
            "total_count": int(row["total_count"]),
            "total_amount": str(Decimal(row["total_amount"])),
        }
        for row in revenue_repo.summary(conn)
    ]


def run(conn, kind: str, *, ran_by: str, amount: Decimal | None = None) -> dict:
    rule = revenue_repo.rule(conn, kind)
    if rule is None:
        raise NotFound("分账规则不存在")
    if rule["status"] != "active":
        raise Unprocessable("该分账规则已暂停")
    legs = _legs(rule)
    _validate(legs)

    collections = revenue_repo.pending(conn, kind)
    collected = sum((Decimal(row["amount"]) for row in collections), Decimal(0))
    total = q4(Decimal(amount)) if amount is not None else q4(collected)
    if total <= 0:
        return {"kind": kind, "amount": "0", "legs": [], "collections": 0,
                "run_id": None, "skipped": "nothing_to_split"}

    currency = rule["currency_code"]
    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    moves: list[dict] = []
    for leg in legs:
        share = Decimal(str(leg["share"]))
        part = q4(total * share)
        if part <= 0:
            continue
        actor = currency_service.system_actor(conn, str(leg["actor"]))
        if leg.get("keep"):
            moves.append({"actor": leg["actor"], "share": str(share), "amount": str(part),
                          "kept": True})
            continue
        currency_service.post(
            conn,
            kind="revenue_split",
            moves=[Move(str(treasury["id"]), currency, -part),
                   Move(str(actor["id"]), currency, part)],
            ref_type="revenue_split",
            ref_id=kind,
            memo=f"{kind} split {share}",
        )
        moves.append({"actor": leg["actor"], "share": str(share), "amount": str(part),
                      "kept": False})

    row = revenue_repo.insert_run(
        conn, kind=kind, currency_code=currency, amount=total, legs=moves,
        collections=len(collections), ran_by=ran_by,
    )
    revenue_repo.mark_split(conn, int(row["id"]), [int(item["id"]) for item in collections])
    return {
        "kind": kind,
        "run_id": int(row["id"]),
        "amount": str(total),
        "currency_code": currency,
        "legs": moves,
        "collections": len(collections),
    }


def run_all(conn, *, ran_by: str = "revenue-split-tick") -> dict:
    results = []
    for rule in revenue_repo.rules(conn):
        if rule["status"] != "active":
            continue
        result = run(conn, rule["kind"], ran_by=ran_by)
        if result.get("run_id"):
            results.append(result)
    return {"runs": len(results), "details": results}
