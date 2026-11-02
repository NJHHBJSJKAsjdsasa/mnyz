"""Investor protection fund endpoints (T-23, 05 §11).

``GET /market/protection`` is public-ish (any logged-in player): it shows the
fund's balance, the cap, and *your own* claims. The reviewer surface under
``/admin/market/protection`` shows everyone's.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import currency_service, investor_protection
from ...infra.context import db
from ...infra.errors import Forbidden
from ...models.protection import ClaimDecisionRequest, ClaimRequest
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_admin,
    require_auth,
    success,
)

bp = Blueprint("protection", __name__)


def _write(payload: dict, action):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        result = action(conn)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


def _actor_id(conn) -> str | None:
    player = player_repo.get(conn, g.player_id)
    if player is None:  # pragma: no cover - require_auth already checked
        return None
    actor = currency_service.actor_for_player(conn, player)
    return str(actor["id"]) if actor else None


@bp.get("/market/protection")
@require_auth()
@rate_limit("protection_view", 60, 60)
def fund_overview():
    with db().connection() as conn:
        actor_id = _actor_id(conn)
        return success(
            {
                "fund": investor_protection.fund(conn),
                "summary": investor_protection.summary(conn),
                "claims": investor_protection.claims(conn, actor_id=actor_id)["claims"]
                if actor_id
                else [],
            }
        )


@bp.post("/market/protection/claims")
@require_auth(write=True)
@rate_limit("protection_claim", 10, 3600)
def file_claim():
    body = parse_model(ClaimRequest)

    def action(conn):
        actor_id = _actor_id(conn)
        if actor_id is None:
            raise Forbidden("需要经济主体才能申请理赔")
        return investor_protection.file_claim(
            conn,
            actor_id=actor_id,
            kind=body.kind,
            amount=body.amount,
            reason=body.reason,
            currency_code=body.currency_code,
            ref_type=body.ref_type,
            ref_id=body.ref_id,
        )

    return _write(
        {
            "kind": body.kind,
            "amount": str(body.amount),
            "reason": body.reason,
        },
        action,
    )


@bp.get("/admin/market/protection/claims")
@require_auth()
@rate_limit("protection_admin", 60, 60)
def list_claims():
    require_admin()
    status = (request.args.get("status") or "").strip() or None
    try:
        limit = int(request.args.get("limit") or 50)
    except ValueError:
        limit = 50
    with db().connection() as conn:
        return success(investor_protection.claims(conn, status=status, limit=limit))


@bp.post("/admin/market/protection/claims/<claim_id>/decide")
@require_auth(write=True)
@rate_limit("protection_decide", 30, 3600)
def decide_claim(claim_id: str):
    require_admin()
    body = parse_model(ClaimDecisionRequest)
    return _write(
        {"claim": claim_id, "approve": body.approve},
        lambda conn: investor_protection.decide(
            conn,
            claim_id=claim_id,
            approve=body.approve,
            reviewer=str(g.player_id),
            note=body.note,
        ),
    )
