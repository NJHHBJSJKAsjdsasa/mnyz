"""Commercial court endpoints (08 §9)."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import court_panel, court_service, currency_service
from ...infra.context import db
from ...infra.errors import Forbidden
from ...models.legal import (
    AppealRequest,
    CourtCaseRequest,
    EnforceRequest,
    EvidenceRequest,
    FreezeRequest,
    PanelVoteRequest,
    RecognitionDecisionRequest,
    RecognitionRequest,
    StrikeRequest,
)
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("court", __name__)


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


def _require_admin(player) -> None:
    if str(player.get("account_role") or "") not in ("admin", "ops"):
        raise Forbidden("需要法院/运维权限")


@bp.get("/court/cases")
@require_auth()
@rate_limit("court_cases", 60, 60)
def my_cases():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        return success({"cases": court_service.my_cases(conn, actor)})


@bp.post("/court/cases")
@require_auth(write=True)
@rate_limit("court_file", 20, 3600)
def file_case():
    body = parse_model(CourtCaseRequest)
    payload = {
        "kind": body.kind,
        "defendant": body.defendant_actor_id,
        "amount": str(body.amount),
        "ticker": body.company_ticker,
    }

    def action(conn, player):
        return court_service.file_case(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            kind=body.kind,
            defendant_actor_id=body.defendant_actor_id,
            amount=body.amount,
            claim=body.claim,
            currency_code=body.currency_code,
            sector=body.sector,
            company_ticker=body.company_ticker,
        )

    return _write(payload, action)


@bp.get("/court/cases/<case_id>")
@require_auth()
@rate_limit("court_case", 120, 60)
def case_detail(case_id: str):
    with db().connection() as conn:
        return success(court_service.case_detail(conn, case_id))


@bp.post("/court/cases/<case_id>/evidence")
@require_auth(write=True)
@rate_limit("court_evidence", 40, 3600)
def add_evidence(case_id: str):
    body = parse_model(EvidenceRequest)

    def action(conn, player):
        return court_service.add_evidence(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            case_id=case_id,
            summary=body.summary,
            payload=body.payload,
        )

    return _write({"case": case_id, "summary": body.summary[:64]}, action)


@bp.post("/court/cases/<case_id>/appeal")
@require_auth(write=True)
@rate_limit("court_appeal", 10, 3600)
def appeal(case_id: str):
    body = parse_model(AppealRequest)

    def action(conn, player):
        return court_service.appeal(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            case_id=case_id,
            panel=body.panel,
        )

    return _write({"case": case_id, "appeal": True, "panel": body.panel}, action)


@bp.get("/court/panels/<panel_id>")
@require_auth()
@rate_limit("court_panel", 120, 60)
def panel_detail(panel_id: str):
    with db().connection() as conn:
        return success(court_panel.detail(conn, panel_id))


@bp.post("/court/panels/<panel_id>/strike")
@require_auth(write=True)
@rate_limit("court_panel_strike", 20, 3600)
def panel_strike(panel_id: str):
    body = parse_model(StrikeRequest)

    def action(conn, player):
        return court_panel.strike(
            conn,
            panel_id=panel_id,
            actor=currency_service.actor_for_player(conn, player),
            member_actor_id=body.member_actor_id,
            for_cause=body.for_cause,
        )

    return _write({"panel": panel_id, "strike": body.member_actor_id}, action)


@bp.post("/court/panels/<panel_id>/vote")
@require_auth(write=True)
@rate_limit("court_panel_vote", 20, 3600)
def panel_vote(panel_id: str):
    body = parse_model(PanelVoteRequest)

    def action(conn, player):
        return court_panel.vote(
            conn,
            panel_id=panel_id,
            actor=currency_service.actor_for_player(conn, player),
            choice=body.choice,
            reason=body.reason,
        )

    return _write({"panel": panel_id, "vote": body.choice}, action)


@bp.post("/court/cases/<case_id>/enforce")
@require_auth(write=True)
@rate_limit("court_enforce", 10, 3600)
def enforce(case_id: str):
    body = parse_model(EnforceRequest)

    def action(conn, player):
        return court_service.enforce(
            conn, actor=currency_service.actor_for_player(conn, player), case_id=case_id,
            region=body.region,
        )

    return _write({"case": case_id, "enforce": True, "region": body.region}, action)


@bp.post("/court/judgments/<judgment_id>/recognition")
@require_auth(write=True)
@rate_limit("court_recognition", 20, 3600)
def request_recognition(judgment_id: str):
    body = parse_model(RecognitionRequest)

    def action(conn, player):
        return court_service.request_recognition(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            judgment_id=judgment_id,
            region=body.region,
        )

    return _write({"judgment": judgment_id, "region": body.region}, action)


@bp.post("/court/recognition/<recognition_id>/appeal")
@require_auth(write=True)
@rate_limit("court_recognition_appeal", 10, 3600)
def appeal_recognition(recognition_id: str):
    def action(conn, player):
        return court_service.appeal_recognition(
            conn,
            actor=currency_service.actor_for_player(conn, player),
            recognition_id=recognition_id,
        )

    return _write({"recognition": recognition_id, "appeal": True}, action)


@bp.post("/admin/court/recognition/<recognition_id>/decide")
@require_auth(write=True)
@rate_limit("court_recognition_decide", 30, 3600)
def decide_recognition(recognition_id: str):
    body = parse_model(RecognitionDecisionRequest)

    def action(conn, player):
        _require_admin(player)
        return court_service.decide_recognition(
            conn,
            recognition_id,
            recognize=body.recognize,
            reason_code=body.reason_code,
            reason=body.reason,
            decided_by=str(player["id"]),
        )

    return _write({"recognition": recognition_id, "recognize": body.recognize}, action)


@bp.post("/admin/court/cases/<case_id>/judge")
@require_auth(write=True)
@rate_limit("court_judge", 60, 3600)
def judge(case_id: str):
    def action(conn, player):
        _require_admin(player)
        return court_service.hold_hearing(conn, case_id)

    return _write({"case": case_id, "judge": True}, action)


@bp.post("/admin/court/cases/<case_id>/freeze")
@require_auth(write=True)
@rate_limit("court_freeze", 60, 3600)
def freeze(case_id: str):
    body = parse_model(FreezeRequest)

    def action(conn, player):
        _require_admin(player)
        return court_service.freeze_asset(
            conn, case_id=case_id, asset_kind=body.asset_kind, asset_id=body.asset_id
        )

    return _write({"case": case_id, "freeze": body.asset_id}, action)


@bp.post("/admin/court/cases/<case_id>/release")
@require_auth(write=True)
@rate_limit("court_release", 60, 3600)
def release(case_id: str):
    body = parse_model(FreezeRequest)

    def action(conn, player):
        _require_admin(player)
        return court_service.release_asset(
            conn, case_id=case_id, asset_kind=body.asset_kind, asset_id=body.asset_id
        )

    return _write({"case": case_id, "release": body.asset_id}, action)
