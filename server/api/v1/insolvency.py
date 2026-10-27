"""Insolvency endpoints (08 §9)."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import currency_service, insolvency_service
from ...infra.context import db
from ...infra.errors import Forbidden
from ...models.legal import ClaimRequest, InsolvencyRequest, PlanRequest, PlanVoteRequest
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("insolvency", __name__)


def _write(payload: dict, action):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        player["account_role"] = getattr(g, "player", {}).get("account_role")
        result = action(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


@bp.post("/insolvency")
@require_auth(write=True)
@rate_limit("insolvency_file", 5, 3600)
def file_case():
    body = parse_model(InsolvencyRequest)

    def action(conn, player):
        return insolvency_service.file_case(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            ticker=body.ticker,
            kind=body.kind,
            reason=body.reason,
        )

    return _write({"ticker": body.ticker, "kind": body.kind}, action)


@bp.get("/insolvency/<case_id>")
@require_auth()
@rate_limit("insolvency_case", 120, 60)
def detail(case_id: str):
    with db().connection() as conn:
        return success(insolvency_service.detail(conn, case_id))


@bp.post("/insolvency/<case_id>/claims")
@require_auth(write=True)
@rate_limit("insolvency_claim", 20, 3600)
def file_claim(case_id: str):
    body = parse_model(ClaimRequest)

    def action(conn, player):
        return insolvency_service.file_claim(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            case_id=case_id,
            kind=body.kind,
            amount=body.amount,
        )

    return _write({"case": case_id, "kind": body.kind, "amount": str(body.amount)}, action)


@bp.post("/insolvency/<case_id>/plan")
@require_auth(write=True)
@rate_limit("insolvency_plan", 10, 3600)
def create_plan(case_id: str):
    body = parse_model(PlanRequest)

    def action(conn, player):
        return insolvency_service.create_plan(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            case_id=case_id,
            document=body.document,
        )

    return _write({"case": case_id, "plan": True}, action)


@bp.post("/insolvency/<case_id>/plan/vote")
@require_auth(write=True)
@rate_limit("insolvency_plan_vote", 30, 3600)
def vote_plan(case_id: str):
    body = parse_model(PlanVoteRequest)

    def action(conn, player):
        return insolvency_service.vote_plan(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            case_id=case_id,
            plan_id=body.plan_id,
            cls=body.claim_class,
            choice=body.choice,
        )

    return _write({"case": case_id, "plan": body.plan_id, "class": body.claim_class}, action)


@bp.post("/insolvency/<case_id>/plan/confirm")
@require_auth(write=True)
@rate_limit("insolvency_plan_confirm", 10, 3600)
def confirm_plan(case_id: str):
    body = parse_model(PlanVoteRequest)

    def action(conn, player):
        return insolvency_service.confirm_plan(conn, case_id, body.plan_id)

    return _write({"case": case_id, "plan": body.plan_id, "confirm": True}, action)


@bp.post("/insolvency/<case_id>/liquidate")
@require_auth(write=True)
@rate_limit("insolvency_liquidate", 5, 3600)
def liquidate(case_id: str):
    def action(conn, player):
        if str(player.get("account_role") or "") not in ("admin", "ops"):
            raise Forbidden("清算需法院/运维执行")
        return insolvency_service.liquidate(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            case_id=case_id,
        )

    return _write({"case": case_id, "liquidate": True}, action)
