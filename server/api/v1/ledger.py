"""Admin ledger surface: inspect transactions, reverse a wrong posting (T-32).

Read endpoints answer "where did this money come from / go"; the single write
endpoint answers "undo it, and say why". Nothing here deletes: a reversal is a
new transaction, so the original row stays exactly where it was.

The per-player view of the same ledger (``/bank/wallet`` etc.) is untouched —
this blueprint is ``admin``/``ops`` only because a reversal moves somebody else's
balance.
"""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, g, request

from ...domain import ledger_reversal
from ...infra.context import db
from ...infra.errors import InvalidArgument
from ...models.ledger import ReverseRequest
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_admin,
    require_auth,
    success,
)

bp = Blueprint("ledger", __name__)


def _int(name: str, default: int, upper: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise InvalidArgument(f"{name} 必须是整数") from None
    return max(0, min(value, upper))


def _since() -> datetime | None:
    raw = request.args.get("since")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        raise InvalidArgument("since 需为 ISO 时间") from None


def _filter(name: str) -> str | None:
    return (request.args.get(name) or "").strip() or None


@bp.get("/admin/ledger/transactions")
@require_auth()
@rate_limit("admin_ledger", 60, 60)
def list_transactions():
    require_admin()
    limit = max(1, _int("limit", 50, 200))
    with db().connection() as conn:
        return success(
            ledger_reversal.recent(
                conn,
                kind=_filter("kind"),
                actor_id=_filter("actor_id"),
                ref_type=_filter("ref_type"),
                ref_id=_filter("ref_id"),
                since=_since(),
                limit=limit,
                offset=_int("offset", 0, 1_000_000),
            )
        )


@bp.get("/admin/ledger/transactions/<tx_id>")
@require_auth()
@rate_limit("admin_ledger", 60, 60)
def transaction_detail(tx_id: str):
    require_admin()
    with db().connection() as conn:
        return success(ledger_reversal.detail(conn, tx_id))


@bp.post("/admin/ledger/transactions/<tx_id>/reverse")
@require_auth(write=True)
@rate_limit("admin_ledger_reverse", 30, 3600)
def reverse_transaction(tx_id: str):
    """Post the mirror of ``tx_id``. Idempotent per transaction."""
    require_admin()
    body = parse_model(ReverseRequest)
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, {"tx": tx_id, "reason": body.reason})
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        result = ledger_reversal.reverse(
            conn, tx_id=tx_id, reason=body.reason, actor=str(g.player_id)
        )
        finish_idempotency(conn, ticket, 200, result)
    return success(result)
