"""Price index, exchange, market-maker and corporate-action endpoints (03 §4, 05 §9)."""

from __future__ import annotations

from datetime import timedelta

from flask import Blueprint, g, request

from ...domain import exchange_service, market_index, market_maker, stock_corporate
from ...infra.clock import now as clock_now
from ...infra.context import db
from ...infra.serialize import ts
from ...infra.errors import Forbidden, InvalidArgument, NotFound
from ...models.market import (
    ArchiveCandlesRequest,
    ArchiveColdRequest,
    ArchivePartitionsRequest,
    ArchiveRestoreRequest,
    ExchangeCreateRequest,
    HaltRequest,
    MmProgramRequest,
    QuoteRequest,
    StockSplitRequest,
)
from ...repo import currency as currency_repo
from ...repo import players as player_repo
from ...repo import stocks as stock_repo
from ..deps import (
    check_if_match,
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_admin,
    require_auth,
    success,
)

bp = Blueprint("market", __name__)


def _write(payload: dict, action):
    """Idempotent write wrapper — same contract as ``stocks._write``.

    ``/admin/**`` views below deliberately bypass it: index publish recomputes a
    snapshot, candle archive uses an idempotent CTE, and partition ensure /
    detach / restore are set-state operations. Replaying any of them is a no-op
    by construction, so an ``Idempotency-Key`` would only add a row.
    """
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        # T-04 / 10 §P1-2: only enforced when the client sends If-Match, so
        # older clients keep working while new ones get real optimistic locking.
        check_if_match(player)
        result = action(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


# ------------------------------------------------------------------ indices
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


# ------------------------------------------------------------------ quotes
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
    def action(conn, player):
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能发布报价")
        return market_index.publish_quote(conn, ticker=ticker, actor_id=str(actor["id"]))

    return _write({"ticker": ticker, "quote": True}, action)


@bp.post("/stocks/<ticker>/quotes")
@require_auth(write=True)
@rate_limit("stock_quotes", 60, 3600)
def place_quotes(ticker: str):
    """Two-sided quote: refresh my own resting orders and re-price both sides."""
    body = parse_model(QuoteRequest)

    def action(conn, player):
        if stock_repo.listing_by_ticker(conn, ticker.strip().upper()) is None:
            raise NotFound("该股票未上市")   # 404 before the actor check, so a typo reads as a typo
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能报价")
        return market_maker.place_quotes(
            conn, actor=actor, ticker=ticker, quantity=body.quantity, refresh=body.refresh
        )

    return _write(
        {"ticker": ticker, "quantity": body.quantity, "refresh": body.refresh}, action
    )


# ------------------------------------------------------------------ exchanges
@bp.get("/exchanges")
@require_auth()
@rate_limit("exchanges", 60, 60)
def exchanges():
    with db().connection() as conn:
        return success(exchange_service.list_exchanges(conn))


@bp.post("/exchanges")
@require_auth(write=True)
@rate_limit("exchange_create", 5, 3600)
def create_exchange():
    body = parse_model(ExchangeCreateRequest)

    def action(conn, player):
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能申请交易所牌照")
        return exchange_service.create_sub(
            conn,
            actor=actor,
            code=body.code,
            name=body.name,
            fee_bps=body.fee_bps,
            listing_fee=body.listing_fee,
            max_listings=body.max_listings,
        )

    return _write({"code": body.code, "name": body.name}, action)


# ------------------------------------------------------------------ market making
@bp.get("/stocks/<ticker>/mm-program")
@require_auth()
@rate_limit("mm_program_view", 60, 60)
def mm_programs(ticker: str):
    with db().connection() as conn:
        player = player_repo.get(conn, g.player_id)
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            return success({"programs": []})
        return success(market_maker.programs(conn, str(actor["id"]), ticker=ticker))


@bp.post("/stocks/<ticker>/mm-program")
@require_auth(write=True)
@rate_limit("mm_program_enroll", 30, 3600)
def mm_enroll(ticker: str):
    body = parse_model(MmProgramRequest)

    def action(conn, player):
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能登记做市")
        return market_maker.enroll(conn, actor=actor, ticker=ticker, quantity=body.quantity)

    return _write({"ticker": ticker, "quantity": body.quantity}, action)


@bp.delete("/stocks/<ticker>/mm-program")
@require_auth(write=True)
@rate_limit("mm_program_pause", 30, 3600)
def mm_disenroll(ticker: str):
    def action(conn, player):
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能操作做市")
        return market_maker.disenroll(conn, actor=actor, ticker=ticker)

    return _write({"ticker": ticker, "mm": "pause"}, action)


# ------------------------------------------------------------------ corporate actions
@bp.post("/stocks/<ticker>/split")
@require_auth(write=True)
@rate_limit("stock_split", 5, 86400)
def split_stock(ticker: str):
    body = parse_model(StockSplitRequest)

    def action(conn, player):
        actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if actor is None:
            raise Forbidden("需要经济主体才能拆股")
        return stock_corporate.split(conn, actor=actor, ticker=ticker, ratio=body.ratio)

    return _write({"ticker": ticker, "ratio": str(body.ratio)}, action)


@bp.get("/stocks/<ticker>/adjustment-factors")
@require_auth()
@rate_limit("stock_factors", 120, 60)
def adjustment_factors(ticker: str):
    with db().connection() as conn:
        return success(stock_corporate.adjustment_factors(conn, ticker))


# ------------------------------------------------------------------ ops: halt / resume
@bp.post("/admin/stocks/<ticker>/halt")
@require_auth(write=True)
@rate_limit("stock_halt", 30, 3600)
def halt_stock(ticker: str):
    require_admin()
    body = parse_model(HaltRequest)

    def action(conn, player):
        listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
        if listing is None:
            raise NotFound("该股票未上市")
        stock_repo.set_halt(
            conn,
            str(listing["id"]),
            clock_now() + timedelta(minutes=body.minutes),
            body.reason or "manual halt",
        )
        return {
            "ticker": listing["ticker"],
            "halted_until": ts(stock_repo.listing_by_ticker(conn, listing["ticker"])["halted_until"]),
            "halt_reason": body.reason or "manual halt",
        }

    return _write({"ticker": ticker, "halt": body.minutes}, action)


@bp.post("/admin/stocks/<ticker>/resume")
@require_auth(write=True)
@rate_limit("stock_resume", 30, 3600)
def resume_stock(ticker: str):
    require_admin()

    def action(conn, player):
        listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
        if listing is None:
            raise NotFound("该股票未上市")
        stock_repo.set_halt(conn, str(listing["id"]), None, "")
        return {"ticker": listing["ticker"], "halted_until": None, "halt_reason": ""}

    return _write({"ticker": ticker, "halt": "resume"}, action)


# ------------------------------------------------------------------ ops: candle archive
@bp.post("/admin/market/candles/archive")
@require_auth(write=True)
@rate_limit("candle_archive", 10, 3600)
def archive_candles():
    require_admin()
    body = parse_model(ArchiveCandlesRequest)
    with db().transaction() as conn:
        return success(stock_corporate.archive_candles(conn, days=body.days))


@bp.get("/admin/market/archive/partitions")
@require_auth()
@rate_limit("archive_status", 30, 60)
def archive_partitions():
    require_admin()
    with db().connection() as conn:
        return success(stock_corporate.archive_status(conn))


@bp.post("/admin/market/archive/partitions")
@require_auth(write=True)
@rate_limit("archive_ensure", 10, 3600)
def archive_ensure():
    require_admin()
    body = parse_model(ArchivePartitionsRequest)
    with db().transaction() as conn:
        return success(stock_corporate.ensure_archive_partitions(
            conn, months_ahead=body.months_ahead, months_back=body.months_back
        ))


@bp.post("/admin/market/archive/cold")
@require_auth(write=True)
@rate_limit("archive_cold", 5, 86400)
def archive_cold():
    require_admin()
    body = parse_model(ArchiveColdRequest)
    with db().transaction() as conn:
        return success(stock_corporate.detach_cold(conn, keep_months=body.keep_months))


@bp.post("/admin/market/archive/restore")
@require_auth(write=True)
@rate_limit("archive_restore", 5, 86400)
def archive_restore():
    require_admin()
    body = parse_model(ArchiveRestoreRequest)
    with db().transaction() as conn:
        return success(stock_corporate.restore_cold(conn, partition=body.partition))


@bp.post("/admin/market/index/publish")
@require_auth(write=True)
@rate_limit("market_index_publish", 60, 3600)
def publish_index():
    require_admin()
    with db().transaction() as conn:
        return success(market_index.tick(conn))
