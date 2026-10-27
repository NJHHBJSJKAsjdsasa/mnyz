"""Revenue split endpoints (ops only): inspect the fee pool and move the shares."""

from __future__ import annotations

from decimal import Decimal

from flask import Blueprint, g

from ...domain import revenue_service
from ...infra.context import db
from ...infra.errors import Forbidden
from ...models.revenue import SplitRequest
from ...repo import revenue as revenue_repo
from ..deps import parse_model, rate_limit, require_auth, success

bp = Blueprint("revenue", __name__)


def _require_admin() -> None:
    if str(getattr(g, "player", {}).get("account_role") or "") not in ("admin", "ops"):
        raise Forbidden("需要运维/管理员权限")


@bp.get("/admin/economy/revenue")
@require_auth()
@rate_limit("revenue_view", 60, 60)
def overview():
    _require_admin()
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
                    "at": row["created_at"].isoformat(),
                }
                for row in runs
            ],
        })


@bp.post("/admin/economy/revenue/split")
@require_auth(write=True)
@rate_limit("revenue_split", 20, 3600)
def split():
    _require_admin()
    body = parse_model(SplitRequest)
    with db().transaction() as conn:
        if body.kind:
            result = revenue_service.run(
                conn, body.kind, ran_by=str(g.player_id), amount=body.amount
            )
        else:
            result = revenue_service.run_all(conn, ran_by=str(g.player_id))
    return success(result)
