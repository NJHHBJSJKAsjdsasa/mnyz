"""Two-sided market making (06 §6.1, 09 §13.5).

A maker publishes a bid and an ask around the index-derived mid. The order size is
capped at a quarter of the visible depth on that side, which is what keeps a single
maker from owning more than 20 % of the book (06 §11 "同向订单 ≤ 市场 20%").
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import ApiError, NotFound
from ..repo import indices as index_repo
from ..repo import stocks as stock_repo
from . import market_index, stock_service

DEPTH_SHARE = Decimal("0.25")   # ours <= 20 % of the book, i.e. book/4
DEFAULT_SIZE_PCT = Decimal("0.001")


def _deep(conn, listing: dict) -> tuple[int, int]:
    bid_depth = sum(int(row["quantity"]) for row in stock_repo.book_bids(conn, str(listing["id"])))
    ask_depth = sum(int(row["quantity"]) for row in stock_repo.book_asks(conn, str(listing["id"])))
    return bid_depth, ask_depth


def _cap(requested: int, depth: int) -> int:
    if depth <= 0:
        return max(1, requested)
    return max(1, min(requested, int(Decimal(depth) * DEPTH_SHARE)))


def _cancel_own(conn, actor: dict, listing_id: str) -> int:
    cancelled = 0
    for order in stock_repo.actor_orders(conn, str(actor["id"]), listing_id=listing_id, limit=200):
        if order["status"] != "open":
            continue
        try:
            stock_service.cancel_order(conn, actor=actor, order_id=str(order["id"]))
            cancelled += 1
        except ApiError:
            continue
    return cancelled


def place_quotes(conn, *, actor: dict, ticker: str, quantity: int | None = None,
                 refresh: bool = True) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    quote = market_index.quote(conn, ticker, actor_id=str(actor["id"]))
    if refresh:
        _cancel_own(conn, actor, str(listing["id"]))

    bid_depth, ask_depth = _deep(conn, listing)
    default_qty = max(1, int(Decimal(int(listing["free_float"])) * DEFAULT_SIZE_PCT))
    requested = int(quantity or default_qty)
    bid_qty = _cap(requested, bid_depth)
    ask_qty = _cap(requested, ask_depth)

    held = stock_repo.holder(conn, str(actor["id"]), str(listing["id"]))
    holdings = int(held["shares"]) if held else 0
    reserved = stock_repo.reserved_shares(conn, str(actor["id"]), str(listing["id"]))
    sellable = max(0, holdings - reserved)
    ask_qty = min(ask_qty, sellable)

    placed: dict[str, dict] = {}
    skipped: dict[str, str] = {}
    for side, price, size in (
        ("buy", quote["bid"], bid_qty),
        ("sell", quote["ask"], ask_qty),
    ):
        if size <= 0:
            skipped[side] = "no_inventory" if side == "sell" else "no_size"
            continue
        try:
            order = stock_service.place_order(
                conn,
                actor=actor,
                ticker=ticker,
                side=side,
                order_type="limit",
                quantity=size,
                price=Decimal(price),
                idem_key=None,
            )
        except ApiError as exc:
            skipped[side] = exc.code
            continue
        placed[side] = {
            "order_id": order.get("order_id"),
            "price": price,
            "quantity": size,
            "status": order.get("status"),
        }

    # keep the quote in the audit trail even when only one side could rest
    index_repo.insert_quote(
        conn,
        listing_id=str(listing["id"]),
        actor_id=str(actor["id"]),
        mid=Decimal(quote["mid"]),
        bid=Decimal(quote["bid"]),
        ask=Decimal(quote["ask"]),
        spread_bps=int(quote["spread_bps"]),
        volatility_bps=int(quote["volatility_bps"]),
        inventory_skew_bps=int(quote["inventory_skew_bps"]),
    )

    return {
        "ticker": listing["ticker"],
        "bid": quote["bid"],
        "ask": quote["ask"],
        "mid": quote["mid"],
        "quoted_mid": quote["quoted_mid"],
        "spread_bps": quote["spread_bps"],
        "orders": placed,
        "skipped": skipped,
        "book_depth": {"bids": bid_depth, "asks": ask_depth},
    }


def enroll(conn, *, actor: dict, ticker: str, quantity: int) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    if quantity <= 0:
        raise NotFound("数量必须大于 0")
    row = index_repo.upsert_program(
        conn, actor_id=str(actor["id"]), listing_id=str(listing["id"]), quantity=int(quantity)
    )
    return {
        "program_id": str(row["id"]),
        "ticker": listing["ticker"],
        "quantity": int(row["quantity"]),
        "status": row["status"],
    }


def disenroll(conn, *, actor: dict, ticker: str) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    row = index_repo.program(conn, actor_id=str(actor["id"]), listing_id=str(listing["id"]))
    if row is None:
        raise NotFound("没有该标的的做市程序")
    index_repo.set_program_status(conn, str(row["id"]), "paused")
    return {"program_id": str(row["id"]), "ticker": listing["ticker"], "status": "paused"}


def refresh(conn, program: dict) -> dict:
    """Re-quote one standing program; failures are recorded, never raised."""
    actor = {"id": str(program["actor_id"])}
    try:
        result = place_quotes(conn, actor=actor, ticker=str(program["ticker"]),
                              quantity=int(program["quantity"]), refresh=True)
    except ApiError as exc:
        index_repo.touch_program(conn, str(program["id"]), error=exc.code)
        return {"program_id": str(program["id"]), "ok": False, "error": exc.code}
    index_repo.touch_program(conn, str(program["id"]))
    return {"program_id": str(program["id"]), "ok": True, "orders": result["orders"]}


def refresh_all(conn) -> dict:
    programs = index_repo.active_programs(conn)
    ok = failed = 0
    for program in programs:
        outcome = refresh(conn, program)
        if outcome["ok"]:
            ok += 1
        else:
            failed += 1
    return {"programs": len(programs), "refreshed": ok, "failed": failed}


def programs(conn, actor_id: str) -> dict:
    return {
        "programs": [
            {
                "program_id": str(row["id"]),
                "ticker": row["ticker"],
                "quantity": int(row["quantity"]),
                "status": row["status"],
                "last_run_at": row["last_run_at"].isoformat() if row["last_run_at"] else None,
                "last_error": row["last_error"],
            }
            for row in index_repo.programs_of_actor(conn, actor_id)
        ]
    }


__all__ = ["place_quotes", "enroll", "disenroll", "refresh", "refresh_all", "programs"]
