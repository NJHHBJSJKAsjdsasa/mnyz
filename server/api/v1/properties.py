"""Property endpoints (04 §7)."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import currency_service, property_service
from ...infra.context import db
from ...infra.errors import Forbidden, InvalidArgument, NotFound
from ...models.commerce import PropertyBidRequest, PropertyListRequest, PropertyRegisterRequest
from ...repo import players as player_repo
from ...repo import properties as property_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("properties", __name__)


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
    if str(player.get("account_role") or "") not in ("admin", "ccmc", "central_bank"):
        raise Forbidden("需要 CCMC/央行权限")


@bp.get("/properties")
@require_auth()
@rate_limit("properties", 120, 60)
def list_properties():
    sector = request.args.get("sector") or None
    kind = request.args.get("kind") or None
    status = request.args.get("status") or None
    with db().connection() as conn:
        rows = property_repo.list_assets(conn, sector=sector, kind=kind, status=status)
    return success({
        "properties": [
            {
                "asset_key": row["asset_key"],
                "kind": row["kind"],
                "name": row["name"],
                "sector": row["jurisdiction_sector"],
                "owner_actor_id": str(row["owner_actor_id"]) if row["owner_actor_id"] else None,
                "deed_no": row["deed_no"],
                "appraised_value": str(row["appraised_value"]),
                "status": row["status"],
            }
            for row in rows
        ]
    })


@bp.get("/properties/my")
@require_auth()
@rate_limit("my_properties", 60, 60)
def my_properties():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        rows = property_repo.list_assets(conn, owner_actor_id=actor["id"])
        bills = property_service.bills_of(conn, actor["id"])
    return success({
        "properties": [
            {
                "asset_key": row["asset_key"],
                "kind": row["kind"],
                "name": row["name"],
                "appraised_value": str(row["appraised_value"]),
                "status": row["status"],
            }
            for row in rows
        ],
        "bills": bills,
    })


@bp.get("/properties/listings")
@require_auth()
@rate_limit("property_listings", 120, 60)
def listings():
    with db().connection() as conn:
        return success({"listings": property_service.listings(conn)})


@bp.post("/properties")
@require_auth(write=True)
@rate_limit("property_register", 30, 60)
def register_property():
    body = parse_model(PropertyRegisterRequest)
    payload = {"asset_key": body.asset_key, "kind": body.kind, "base": str(body.base_by_type)}

    def action(conn, player):
        _require_admin(player)
        return property_service.register_asset(
            conn,
            asset_key=body.asset_key,
            kind=body.kind,
            name=body.name,
            jurisdiction_sector=body.jurisdiction_sector,
            owner_actor_id=body.owner_actor_id,
            base_by_type=body.base_by_type,
            resource_score=body.resource_score,
            development_level=body.development_level,
            traffic_index=body.traffic_index,
        )

    return _write(payload, action)


@bp.get("/properties/tax")
@require_auth()
@rate_limit("property_tax", 60, 60)
def tax_bills():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        return success({"bills": property_service.bills_of(conn, actor["id"])})


@bp.post("/properties/tax/<bill_id>/pay")
@require_auth(write=True)
@rate_limit("property_tax_pay", 20, 60)
def pay_tax(bill_id: str):
    payload = {"bill": bill_id}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return property_service.pay_tax(conn, actor=actor, bill_id=bill_id)

    return _write(payload, action)


@bp.post("/properties/<path:asset_key>/list")
@require_auth(write=True)
@rate_limit("property_list", 20, 60)
def list_property(asset_key: str):
    body = parse_model(PropertyListRequest)
    payload = {"asset": asset_key, "price": str(body.price), "kind": body.kind}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return property_service.list_asset(
            conn,
            actor=actor,
            asset_key=asset_key,
            price=body.price,
            kind=body.kind,
            days=body.days,
            min_increment=body.min_increment,
        )

    return _write(payload, action)


@bp.post("/properties/listings/<listing_id>/buy")
@require_auth(write=True)
@rate_limit("property_buy", 20, 60)
def buy_property(listing_id: str):
    payload = {"listing": listing_id}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return property_service.buy(conn, buyer=actor, listing_id=listing_id)

    return _write(payload, action)


@bp.post("/properties/listings/<listing_id>/bid")
@require_auth(write=True)
@rate_limit("property_bid", 30, 60)
def bid_property(listing_id: str):
    body = parse_model(PropertyBidRequest)
    payload = {"listing": listing_id, "amount": str(body.amount)}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return property_service.bid(conn, bidder=actor, listing_id=listing_id, amount=body.amount)

    return _write(payload, action)


@bp.post("/properties/listings/<listing_id>/close")
@require_auth(write=True)
@rate_limit("property_close", 30, 60)
def close_auction(listing_id: str):
    payload = {"listing": listing_id}

    def action(conn, player):
        _require_admin(player)
        return property_service.close_auction(conn, listing_id=listing_id)

    return _write(payload, action)
