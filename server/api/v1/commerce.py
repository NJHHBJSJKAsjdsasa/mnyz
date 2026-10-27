"""Company and commerce endpoints (03 §8)."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import company_law, company_service, currency_service
from ...infra.context import db
from ...models.commerce import CompanyRequest, FinancialsRequest, ShareTransferRequest
from ...models.legal import (
    CharterRequest,
    MeetingRequest,
    RelatedPartyDecisionRequest,
    RelatedPartyRequest,
    ResolutionRequest,
    VoteRequest,
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

bp = Blueprint("commerce", __name__)


def _write(payload: dict, action):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = action(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


@bp.get("/companies")
@require_auth()
@rate_limit("companies", 60, 60)
def list_companies():
    with db().connection() as conn:
        return success({"companies": company_service.list_companies(conn)})


@bp.get("/companies/<ticker>")
@require_auth()
@rate_limit("company", 60, 60)
def company_detail(ticker: str):
    with db().connection() as conn:
        return success(company_service.detail(conn, ticker))


@bp.post("/companies")
@require_auth(write=True)
@rate_limit("company_register", 10, 3600)
def register_company():
    body = parse_model(CompanyRequest)
    payload = {"ticker": body.ticker, "name": body.name, "shares": body.shares_total}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return company_service.register(
            conn,
            actor=actor,
            ticker=body.ticker,
            name=body.name,
            shares_total=body.shares_total,
            jurisdiction_sector=body.jurisdiction_sector,
        )

    return _write(payload, action)


@bp.post("/companies/<ticker>/shares/transfer")
@require_auth(write=True)
@rate_limit("share_transfer", 30, 60)
def transfer_shares(ticker: str):
    body = parse_model(ShareTransferRequest)
    payload = {"ticker": ticker, "to": body.to_actor_id, "shares": body.shares}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return company_service.transfer_shares(
            conn, actor=actor, ticker=ticker, to_actor_id=body.to_actor_id, shares=body.shares
        )

    return _write(payload, action)


@bp.post("/companies/<ticker>/financials")
@require_auth(write=True)
@rate_limit("company_financials", 20, 60)
def publish_financials(ticker: str):
    body = parse_model(FinancialsRequest)
    payload = {"ticker": ticker, "period": body.period.isoformat()}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return company_service.publish_financials(
            conn,
            actor=actor,
            ticker=ticker,
            period=body.period,
            revenue=body.revenue,
            cost=body.cost,
            assets=body.assets,
            liabilities=body.liabilities,
        )

    return _write(payload, action)


@bp.get("/commerce/licenses")
@require_auth()
@rate_limit("licenses", 60, 60)
def licenses():
    from ...repo import companies as company_repo

    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        rows = company_repo.licenses_of(conn, actor["id"])
    return success({
        "licenses": [
            {
                "id": str(row["id"]),
                "kind": row["kind"],
                "status": row["status"],
                "monthly_fee": str(row["monthly_fee"]),
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            }
            for row in rows
        ]
    })


# ------------------------------------------------------------------ governance
@bp.post("/companies/<ticker>/charter")
@require_auth(write=True)
@rate_limit("company_charter", 10, 3600)
def submit_charter(ticker: str):
    body = parse_model(CharterRequest)
    payload = {"ticker": ticker, "version": len(body.document)}

    def action(conn, player):
        return company_law.submit_charter(
            conn, actor=currency_service.actor_for_player(conn, player),
            ticker=ticker, document=body.document,
        )

    return _write(payload, action)


@bp.get("/companies/<ticker>/governance")
@require_auth()
@rate_limit("company_governance", 60, 60)
def governance(ticker: str):
    with db().connection() as conn:
        return success(company_law.governance(conn, ticker))


@bp.post("/companies/<ticker>/meetings")
@require_auth(write=True)
@rate_limit("company_meeting", 20, 3600)
def convene_meeting(ticker: str):
    body = parse_model(MeetingRequest)

    def action(conn, player):
        return company_law.convene(
            conn, actor=currency_service.actor_for_player(conn, player),
            ticker=ticker, kind=body.kind,
        )

    return _write({"ticker": ticker, "kind": body.kind}, action)


@bp.post("/companies/<ticker>/resolutions")
@require_auth(write=True)
@rate_limit("company_resolution", 30, 3600)
def propose_resolution(ticker: str):
    body = parse_model(ResolutionRequest)

    def action(conn, player):
        return company_law.propose(
            conn, actor=currency_service.actor_for_player(conn, player),
            ticker=ticker, kind=body.kind, payload=body.payload,
        )

    return _write({"ticker": ticker, "kind": body.kind}, action)


@bp.post("/companies/resolutions/<resolution_id>/vote")
@require_auth(write=True)
@rate_limit("resolution_vote", 60, 60)
def vote_resolution(resolution_id: str):
    body = parse_model(VoteRequest)

    def action(conn, player):
        return company_law.vote(
            conn, actor=currency_service.actor_for_player(conn, player),
            resolution_id=resolution_id, choice=body.choice,
        )

    return _write({"resolution": resolution_id, "choice": body.choice}, action)


@bp.post("/companies/resolutions/<resolution_id>/close")
@require_auth(write=True)
@rate_limit("resolution_close", 60, 60)
def close_resolution(resolution_id: str):
    def action(conn, player):
        return company_law.close_resolution(
            conn, actor=currency_service.actor_for_player(conn, player),
            resolution_id=resolution_id,
        )

    return _write({"resolution": resolution_id, "close": True}, action)


@bp.post("/companies/<ticker>/related-party")
@require_auth(write=True)
@rate_limit("related_party", 30, 3600)
def declare_related_party(ticker: str):
    body = parse_model(RelatedPartyRequest)

    def action(conn, player):
        return company_law.declare_related_party(
            conn, actor=currency_service.actor_for_player(conn, player),
            ticker=ticker, counterparty_actor_id=body.counterparty_actor_id,
            kind=body.kind, amount=body.amount,
        )

    return _write({"ticker": ticker, "amount": str(body.amount)}, action)


@bp.post("/companies/<ticker>/related-party/<txn_id>/decide")
@require_auth(write=True)
@rate_limit("related_party_decide", 30, 3600)
def decide_related_party(ticker: str, txn_id: str):
    body = parse_model(RelatedPartyDecisionRequest)

    def action(conn, player):
        return company_law.decide_related_party(
            conn, actor=currency_service.actor_for_player(conn, player),
            ticker=ticker, txn_id=txn_id, approve=body.approve,
        )

    return _write({"ticker": ticker, "txn": txn_id, "approve": body.approve}, action)
