"""M4 endpoints: market, contracts, shipyard and tech."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import contract_service, market_service, shipyard_service
from ...infra.context import db
from ...models.explore import MarketOrderRequest, RefitRequest
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    check_if_match,
    current_player,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("economy", __name__)


@bp.get("/planets/<path:planet_key>/market")
@require_auth()
@rate_limit("market", 120, 60)
def market(planet_key: str):
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        data = market_service.get_market(conn, player, planet_key)
    return success(data)


@bp.post("/planets/<path:planet_key>/market/buy")
@require_auth(write=True)
@rate_limit("market_buy", 60, 60)
def market_buy(planet_key: str):
    body = parse_model(MarketOrderRequest)
    return _market_order(planet_key, body, "buy")


@bp.post("/planets/<path:planet_key>/market/sell")
@require_auth(write=True)
@rate_limit("market_sell", 60, 60)
def market_sell(planet_key: str):
    body = parse_model(MarketOrderRequest)
    return _market_order(planet_key, body, "sell")


@bp.get("/contracts")
@require_auth()
@rate_limit("contracts", 60, 60)
def contracts():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        items = contract_service.list_contracts(conn, player)
    return success({"contracts": items, "state_version": int(player["state_version"])})


@bp.post("/contracts/<contract_id>/accept")
@require_auth(write=True)
@rate_limit("contract_accept", 60, 60)
def contract_accept(contract_id: str):
    return _contract_action(contract_id, "accept")


@bp.post("/contracts/<contract_id>/claim")
@require_auth(write=True)
@rate_limit("contract_claim", 60, 60)
def contract_claim(contract_id: str):
    return _contract_action(contract_id, "claim")


@bp.post("/ship/upgrade")
@require_auth(write=True)
@rate_limit("ship_upgrade", 30, 60)
def ship_upgrade():
    return _ship_action(None, "upgrade")


@bp.post("/ship/modules/<module_code>/refit")
@require_auth(write=True)
@rate_limit("ship_refit", 30, 60)
def ship_refit(module_code: str):
    body = parse_model(RefitRequest)
    return _ship_action(module_code, "refit", body.use_voucher)


@bp.post("/ship/modules/<module_code>/overclock")
@require_auth(write=True)
@rate_limit("ship_overclock", 30, 60)
def ship_overclock(module_code: str):
    return _ship_action(module_code, "overclock")


@bp.post("/ship/repair")
@require_auth(write=True)
@rate_limit("ship_repair", 30, 60)
def ship_repair():
    return _ship_action(None, "repair")


@bp.post("/tech/<node_code>/unlock")
@require_auth(write=True)
@rate_limit("tech_unlock", 30, 60)
def tech_unlock(node_code: str):
    check_if_match(current_player())
    payload = {"node": node_code}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = shipyard_service.unlock_tech(conn, player, node_code)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


def _market_order(planet_key: str, body: MarketOrderRequest, side: str):
    check_if_match(current_player())
    payload = {"planet_key": planet_key, "resource": body.resource_code, "quantity": body.quantity, "side": side}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        operation = market_service.buy if side == "buy" else market_service.sell
        result = operation(conn, player, planet_key, body.resource_code, body.quantity)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


def _contract_action(contract_id: str, action: str):
    check_if_match(current_player())
    payload = {"contract_id": contract_id, "action": action}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        operation = contract_service.accept if action == "accept" else contract_service.claim
        result = operation(conn, player, contract_id)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


def _ship_action(module_code: str | None, action: str, use_voucher: bool = False):
    check_if_match(current_player())
    payload = {"module": module_code, "action": action, "use_voucher": use_voucher}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        if action == "upgrade":
            result = shipyard_service.upgrade_ship(conn, player)
        elif action == "repair":
            result = shipyard_service.repair_hull(conn, player)
        elif action == "refit":
            result = shipyard_service.refit_module(conn, player, module_code or "", use_voucher)
        else:
            result = shipyard_service.overclock_module(conn, player, module_code or "")
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))
