"""Brokerage and multi-venue endpoints (05 §9, 03 §5)."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import broker_service, currency_service
from ...infra.context import db
from ...models.broker import BrokerAccountRequest, FirmRequest, MembershipRequest, VenueRequest
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("brokers", __name__)


def _write(payload: dict, action):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = action(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


def _actor(conn, player) -> dict:
    return currency_service.actor_for_player(conn, player)


# ------------------------------------------------------------------ firm side
@bp.post("/brokers/firms")
@require_auth(write=True)
@rate_limit("broker_firm", 5, 86400)
def register_firm():
    body = parse_model(FirmRequest)

    def action(conn, player):
        return broker_service.register_firm(
            conn, actor=_actor(conn, player), capital=body.capital
        )

    return _write({"capital": str(body.capital)}, action)


@bp.post("/brokers/memberships")
@require_auth(write=True)
@rate_limit("broker_membership", 10, 86400)
def join_venue():
    body = parse_model(MembershipRequest)

    def action(conn, player):
        return broker_service.join_venue(
            conn,
            actor=_actor(conn, player),
            exchange_code=body.exchange_code,
            commission_bps=body.commission_bps,
        )

    return _write({"exchange": body.exchange_code, "bps": body.commission_bps}, action)


@bp.get("/brokers/me")
@require_auth()
@rate_limit("broker_me", 60, 60)
def broker_me():
    with db().connection() as conn:
        return success(broker_service.broker_book(conn, actor=_actor(conn, player_repo.get(conn, g.player_id))))


# ------------------------------------------------------------------ client side
@bp.post("/brokers/accounts")
@require_auth(write=True)
@rate_limit("broker_account", 20, 3600)
def open_account():
    body = parse_model(BrokerAccountRequest)

    def action(conn, player):
        return broker_service.open_account(
            conn,
            actor=_actor(conn, player),
            broker_code=body.broker_code,
            commission_bps=body.commission_bps,
        )

    return _write({"broker": body.broker_code, "bps": body.commission_bps}, action)


@bp.get("/brokers/accounts/me")
@require_auth()
@rate_limit("broker_account_me", 120, 60)
def my_account():
    with db().connection() as conn:
        return success(broker_service.my_account(conn, actor=_actor(conn, player_repo.get(conn, g.player_id))))


@bp.delete("/brokers/accounts/me")
@require_auth(write=True)
@rate_limit("broker_account_close", 10, 3600)
def close_account():
    def action(conn, player):
        return broker_service.close_account(conn, actor=_actor(conn, player))

    return _write({"close": True}, action)


# ------------------------------------------------------------------ venues
@bp.get("/stocks/<ticker>/venues")
@require_auth()
@rate_limit("stock_venues", 120, 60)
def listing_venues(ticker: str):
    with db().connection() as conn:
        return success(broker_service.listing_venues(conn, ticker))


@bp.post("/stocks/<ticker>/venues")
@require_auth(write=True)
@rate_limit("stock_venue_add", 10, 3600)
def add_venue(ticker: str):
    body = parse_model(VenueRequest)

    def action(conn, player):
        return broker_service.join_listing(
            conn,
            actor=_actor(conn, player),
            ticker=ticker,
            exchange_code=body.exchange_code,
            fee_bps=body.fee_bps,
        )

    return _write({"ticker": ticker, "exchange": body.exchange_code}, action)


@bp.delete("/stocks/<ticker>/venues/<code>")
@require_auth(write=True)
@rate_limit("stock_venue_remove", 10, 3600)
def remove_venue(ticker: str, code: str):
    def action(conn, player):
        return broker_service.leave_listing(
            conn, actor=_actor(conn, player), ticker=ticker, exchange_code=code
        )

    return _write({"ticker": ticker, "exchange": code, "remove": True}, action)
