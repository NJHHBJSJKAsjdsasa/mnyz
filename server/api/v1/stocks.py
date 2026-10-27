"""Stock market endpoints (05 §8)."""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, g, request

from ...domain import currency_service, stock_service
from ...infra.context import db
from ...infra.errors import InvalidArgument
from ...models.stock import (
    CoverRequest,
    DividendRequest,
    IpoRequest,
    LendRequest,
    MarginDepositRequest,
    ShortRequest,
    StockOrderRequest,
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

bp = Blueprint("stocks", __name__)


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


# ------------------------------------------------------------------ market
@bp.get("/stocks")
@require_auth()
@rate_limit("stocks", 120, 60)
def list_stocks():
    status = request.args.get("status") or "listed"
    with db().connection() as conn:
        return success({"stocks": stock_service.list_stocks(conn, status=status)})


@bp.get("/stocks/orders")
@require_auth()
@rate_limit("stock_orders", 120, 60)
def my_orders():
    ticker = request.args.get("ticker") or None
    with db().connection() as conn:
        actor = _actor(conn, player_repo.get(conn, g.player_id))
        return success({"orders": stock_service.my_orders(conn, actor, ticker)})


@bp.get("/stocks/portfolio")
@require_auth()
@rate_limit("stock_portfolio", 120, 60)
def portfolio():
    with db().connection() as conn:
        actor = _actor(conn, player_repo.get(conn, g.player_id))
        return success(stock_service.portfolio(conn, actor))


@bp.get("/stocks/margin")
@require_auth()
@rate_limit("stock_margin", 60, 60)
def margin():
    with db().connection() as conn:
        actor = _actor(conn, player_repo.get(conn, g.player_id))
        return success(stock_service.margin_info(conn, actor))


@bp.get("/stocks/<ticker>")
@require_auth()
@rate_limit("stock_detail", 180, 60)
def stock_detail(ticker: str):
    with db().connection() as conn:
        return success(stock_service.detail(conn, ticker))


@bp.get("/stocks/<ticker>/candles")
@require_auth()
@rate_limit("stock_candles", 180, 60)
def stock_candles(ticker: str):
    interval = request.args.get("interval") or "1m"
    try:
        limit = int(request.args.get("limit") or 300)
    except ValueError:
        raise InvalidArgument("limit 必须是整数")
    before = request.args.get("before")
    before_at = None
    if before:
        try:
            before_at = datetime.fromisoformat(before)
        except ValueError:
            raise InvalidArgument("before 需为 ISO 时间")
    with db().connection() as conn:
        return success(stock_service.candles(conn, ticker, interval, limit, before_at))


@bp.get("/stocks/<ticker>/dividends")
@require_auth()
@rate_limit("stock_dividends", 60, 60)
def stock_dividends(ticker: str):
    with db().connection() as conn:
        return success({"dividends": stock_service.dividends(conn, ticker)})


@bp.get("/stocks/<ticker>/delisting")
@require_auth()
@rate_limit("stock_delisting", 60, 60)
def stock_delisting(ticker: str):
    with db().connection() as conn:
        return success(stock_service.delisting_status(conn, ticker))


# ------------------------------------------------------------------ trading
@bp.post("/stocks/<ticker>/orders")
@require_auth(write=True)
@rate_limit("stock_place_order", 120, 60)
def place_order(ticker: str):
    body = parse_model(StockOrderRequest)
    payload = {
        "ticker": ticker,
        "side": body.side,
        "type": body.type,
        "price": str(body.price) if body.price is not None else None,
        "quantity": body.quantity,
    }

    def action(conn, player):
        return stock_service.place_order(
            conn,
            actor=_actor(conn, player),
            ticker=ticker,
            side=body.side,
            order_type=body.type,
            quantity=body.quantity,
            price=body.price,
        )

    return _write(payload, action)


@bp.delete("/stocks/orders/<order_id>")
@require_auth(write=True)
@rate_limit("stock_cancel", 120, 60)
def cancel_order(order_id: str):
    def action(conn, player):
        return stock_service.cancel_order(conn, actor=_actor(conn, player), order_id=order_id)

    return _write({"order_id": order_id}, action)


@bp.post("/stocks/<ticker>/short")
@require_auth(write=True)
@rate_limit("stock_short", 30, 60)
def open_short(ticker: str):
    body = parse_model(ShortRequest)

    def action(conn, player):
        return stock_service.open_short(
            conn, actor=_actor(conn, player), ticker=ticker, quantity=body.quantity
        )

    return _write({"ticker": ticker, "short": body.quantity}, action)


@bp.post("/stocks/<ticker>/cover")
@require_auth(write=True)
@rate_limit("stock_cover", 30, 60)
def cover_short(ticker: str):
    body = parse_model(CoverRequest)

    def action(conn, player):
        return stock_service.cover_short(
            conn, actor=_actor(conn, player), ticker=ticker, quantity=body.quantity
        )

    return _write({"ticker": ticker, "cover": body.quantity}, action)


@bp.post("/stocks/<ticker>/lend")
@require_auth(write=True)
@rate_limit("stock_lend", 30, 60)
def lend_shares(ticker: str):
    body = parse_model(LendRequest)

    def action(conn, player):
        return stock_service.lend_shares(
            conn,
            actor=_actor(conn, player),
            ticker=ticker,
            quantity=body.quantity,
            fee_bps=body.fee_bps,
            days=body.days,
        )

    return _write({"ticker": ticker, "lend": body.quantity, "fee_bps": body.fee_bps}, action)


@bp.post("/stocks/<ticker>/margin")
@require_auth(write=True)
@rate_limit("stock_margin_deposit", 30, 60)
def deposit_margin(ticker: str):
    body = parse_model(MarginDepositRequest)

    def action(conn, player):
        return stock_service.deposit_margin(
            conn, actor=_actor(conn, player), amount=body.amount
        )

    return _write({"ticker": ticker, "margin": str(body.amount)}, action)


@bp.post("/stocks/ipo")
@require_auth(write=True)
@rate_limit("stock_ipo", 5, 3600)
def ipo():
    body = parse_model(IpoRequest)

    def action(conn, player):
        return stock_service.ipo(
            conn,
            actor=_actor(conn, player),
            ticker=body.ticker,
            offer_shares=body.offer_shares,
            price=body.price,
            settlement_mode=body.settlement_mode,
            shortable=body.shortable,
        )

    return _write({"ticker": body.ticker, "ipo": body.offer_shares}, action)


@bp.post("/stocks/<ticker>/dividends")
@require_auth(write=True)
@rate_limit("stock_pay_dividend", 10, 3600)
def pay_dividend(ticker: str):
    body = parse_model(DividendRequest)

    def action(conn, player):
        return stock_service.pay_dividend(
            conn, actor=_actor(conn, player), ticker=ticker, per_share=body.per_share
        )

    return _write({"ticker": ticker, "dividend": str(body.per_share)}, action)
