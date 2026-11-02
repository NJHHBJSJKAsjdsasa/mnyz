"""Cosmic council API: seats, motions, votes."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import council_service
from ...infra.context import db
from ...models.explore import CouncilIpoRequest, CouncilSectorRequest, CouncilVoteRequest
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    check_if_match,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("council", __name__)


def _read(fn):
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        result = fn(conn, player)
    return success(result)


def _write(payload: dict, fn):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        # Checked inside the transaction against the row we are about to write
        # (not the request-scoped copy), so a concurrent vote is caught.
        check_if_match(player)
        result = fn(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result.get("state_version", 0)))


@bp.get("/council")
@require_auth()
@rate_limit("council_read", 60, 60)
def council():
    return _read(council_service.view)


@bp.post("/council/sector-license")
@require_auth(write=True)
@rate_limit("council_sector", 10, 60)
def council_sector():
    body = parse_model(CouncilSectorRequest)
    return _write(
        {"kind": "sector_license", "sector_key": body.sector_key},
        lambda conn, player: council_service.apply_sector(conn, player, body.sector_key),
    )


@bp.post("/council/ipo")
@require_auth(write=True)
@rate_limit("council_ipo", 5, 60)
def council_ipo():
    body = parse_model(CouncilIpoRequest)
    return _write(
        {"kind": "ipo", "ticker": body.ticker.upper(), "price": str(body.price)},
        lambda conn, player: council_service.apply_ipo(
            conn,
            player,
            ticker=body.ticker,
            offer_shares=body.offer_shares,
            price=body.price,
            exchange_code=body.exchange_code,
            call_auction_minutes=body.call_auction_minutes,
        ),
    )


@bp.post("/council/seat")
@require_auth(write=True)
@rate_limit("council_seat", 5, 60)
def council_seat():
    return _write(
        {"kind": "membership"},
        lambda conn, player: council_service.apply_seat(conn, player),
    )


@bp.post("/council/motions/<motion_id>/vote")
@require_auth(write=True)
@rate_limit("council_vote", 30, 60)
def council_vote(motion_id: str):
    body = parse_model(CouncilVoteRequest)
    return _write(
        {"motion_id": motion_id, "vote": body.vote},
        lambda conn, player: council_service.vote(conn, player, motion_id, body.vote),
    )


@bp.post("/council/leave")
@require_auth(write=True)
@rate_limit("council_leave", 5, 60)
def council_leave():
    return _write(
        {"kind": "leave"},
        lambda conn, player: council_service.leave(conn, player),
    )
