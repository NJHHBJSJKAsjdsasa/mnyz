"""Price index and market-maker quote endpoints (03 §4, 06 §6.1)."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import market_index, market_maker
from ...infra.context import db
from ...infra.errors import Forbidden, InvalidArgument, NotFound
from ...repo import currency as currency_repo
from ...repo import players as player_repo
from ...repo import stocks as stock_repo
from ..deps import rate_limit, require_auth, success

bp = Blueprint("market", __name__)


@bp.get("/market/indices")
@require_auth()
@rate_limit("market_indices", 120, 60)
def indices():
    with db().connection() as conn:
        return success({"indices": market_index.overview(conn)})


@bp.get("/market/indices/<code>/points")
@require_auth()
@rate_limit("market_index_points", 120, 60)
def index_points(code: str):
    try:
        limit = int(request.args.get("limit") or 120)
    except ValueError:
        raise InvalidArgument("limit 必须是整数") from None
    with db().connection() as conn:
        return success(market_index.series(conn, code.strip().upper(), limit))


@bp.get("/stocks/<ticker>/quote")
@require_auth()
@rate_limit("stock_quote", 180, 60)
def stock_quote(ticker: str):
    with db().connection() as conn:
        player = player_repo.get(conn, g.player_id)
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        return success(market_index.quote(conn, ticker, actor_id=str(actor["id"]) if actor else None))


@bp.post("/stocks/<ticker>/quote")
@require_auth(write=True)
@rate_limit("stock_quote_publish", 120, 3600)
def publish_quote(ticker: str):
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能发布报价")
        return success(market_index.publish_quote(conn, ticker=ticker, actor_id=str(actor["id"])))


@bp.post("/admin/market/index/publish")
@require_auth(write=True)
@rate_limit("market_index_publish", 60, 3600)
def publish_index():
    if str(getattr(g, "player", {}).get("account_role") or "") not in ("admin", "ops"):
        raise Forbidden("需要运维/管理员权限")
    with db().transaction() as conn:
        return success(market_index.tick(conn))


@bp.post("/stocks/<ticker>/quotes")
@require_auth(write=True)
@rate_limit("stock_quotes", 60, 3600)
def place_quotes(ticker: str):
    """Two-sided quote: refresh my own resting orders and re-price both sides."""
    body = request.get_json(silent=True) or {}
    quantity = body.get("quantity")
    refresh = bool(body.get("refresh", True))
    if quantity is not None and (not isinstance(quantity, int) or quantity <= 0):
        raise InvalidArgument("quantity 必须是正整数")
    with db().transaction() as conn:
        if stock_repo.listing_by_ticker(conn, ticker.strip().upper()) is None:
            raise NotFound("该股票未上市")   # 404 before the actor check, so a typo reads as a typo
        player = player_repo.get(conn, g.player_id)
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能报价")
        return success(market_maker.place_quotes(
            conn, actor=actor, ticker=ticker, quantity=quantity, refresh=refresh
        ))
