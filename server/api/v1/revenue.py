"""Revenue split endpoints (ops only): inspect the fee pool and move the shares."""

from __future__ import annotations

from decimal import Decimal

from flask import Blueprint, g

from ...domain import revenue_service
from ...infra.context import db
from ...infra.serialize import ts
from ...models.revenue import RevenueSplitRequest
from ...repo import revenue as revenue_repo
from ..deps import parse_model, rate_limit, require_admin, require_auth, success

bp = Blueprint("revenue", __name__)


@bp.get("/admin/economy/revenue")
@require_auth()
@rate_limit("revenue_view", 60, 60)
def overview():
    require_admin()
    with db().connection() as conn:
        runs = revenue_repo.runs(conn, limit=10)
        return success({
            "rules": revenue_service.rules(conn),
            "summary": revenue_service.summary(conn),
            "runs": [
                {
                    "id": int(row["id"]),
                    "kind": row["kind"],
                    "currency_code": row["currency_code"],
                    "amount": str(Decimal(row["amount"])),
                    "collections": int(row["collections"]),
                    "ran_by": row["ran_by"],
                    "at": ts(row["created_at"]),
                }
                for row in runs
            ],
        })


@bp.post("/admin/economy/revenue/split")
@require_auth(write=True)
@rate_limit("revenue_split", 20, 3600)
def split():
    require_admin()
    body = parse_model(RevenueSplitRequest)
    with db().transaction() as conn:
        if body.kind:
            result = revenue_service.run(
                conn, body.kind, ran_by=str(g.player_id), amount=body.amount
            )
        else:
            result = revenue_service.run_all(conn, ran_by=str(g.player_id))
    return success(result)
