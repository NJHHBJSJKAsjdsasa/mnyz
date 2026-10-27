"""Stock market: IPO, order matching, candles, shorting and delisting (05).

Rules
-----
* one official exchange (``CUEX``), quotes in Q4 ``cc4``;
* price/time priority, limit plus market orders capped at five price levels;
* a trade, its ledger transaction, the share move and the candle upsert all
  happen in one DB transaction (05 §10);
* T+1 listings lock bought shares until the next UTC midnight, cash is free;
* fees: 0.10 % per side plus 0.10 % stamp tax on the sell side, minimum
  0.0001, all of it goes to the treasury (CCMC) for now;
* shorting needs a margin account, borrowed stock and 150 % initial margin;
  naked shorts are refused, and a single name is capped at 15 % of the float.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from ..infra.errors import (
    Forbidden,
    InsufficientFunds,
    InvalidArgument,
    NotFound,
    Unprocessable,
)
from ..repo import companies as company_repo
from ..repo import currency as currency_repo
from ..repo import revenue as revenue_repo
from ..repo import stocks as stock_repo
from . import currency_service
from .currency_service import Move, q4

FEE_BPS = Decimal(10)        # 0.10 % per side
STAMP_TAX_BPS = Decimal(10)  # 0.10 % on the sell side
MIN_FEE = Decimal("0.0001")
MARKET_LEVELS = 5            # 05 §4.2
POSITION_CAP = Decimal("0.10")    # 05 §6 single-actor cap
SHORT_POOL_CAP = Decimal("0.15")  # 05 §12.2
INITIAL_MARGIN = Decimal("1.5")
MAINTENANCE_MARGIN = Decimal("1.3")
FORCE_MARGIN = Decimal("1.05")
HALT_PCT = Decimal("0.30")
BREAKER_PCT = Decimal("0.20")
IPO_MIN_AGE_DAYS = 7
IPO_MIN_BOOK_VALUE = Decimal(50_000)
IPO_MIN_FREE_FLOAT = Decimal("0.20")
DIVIDEND_CONTROL = Decimal("0.50")
CANDLE_INTERVALS = ("1m", "5m", "15m", "1h", "1d")
OFFICIAL_EXCHANGE = "CUEX"


# ------------------------------------------------------------------ helpers
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _next_utc_midnight(now: datetime | None = None) -> datetime:
    current = now or _now()
    return datetime.combine(current.date() + timedelta(days=1), time.min, tzinfo=timezone.utc)


def _bucket(ts: datetime, interval: str) -> datetime:
    ts = ts.astimezone(timezone.utc).replace(second=0, microsecond=0)
    if interval == "1m":
        return ts
    if interval == "5m":
        return ts.replace(minute=ts.minute - ts.minute % 5)
    if interval == "15m":
        return ts.replace(minute=ts.minute - ts.minute % 15)
    if interval == "1h":
        return ts.replace(minute=0)
    return ts.replace(hour=0, minute=0)


def _fee(notional: Decimal) -> Decimal:
    return max(q4(notional * FEE_BPS / Decimal(10_000)), MIN_FEE)


def _tax(notional: Decimal) -> Decimal:
    return max(q4(notional * STAMP_TAX_BPS / Decimal(10_000)), MIN_FEE)


def _lock_listing(conn, ticker: str) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper(), for_update=True)
    if listing is None:
        raise NotFound("该股票未上市")
    return listing


def _assert_tradable(listing: dict) -> None:
    if listing["status"] != "listed":
        raise Unprocessable({"suspended": "该股票已停牌", "delisted": "该股票已退市"}.get(
            listing["status"], "该股票当前不可交易"))
    halted = listing["halted_until"]
    if halted is not None and halted > _now():
        raise Unprocessable(
            f"熔断中（{listing['halt_reason'] or '价格异动'}），恢复时间 {halted.isoformat()}"
        )


def _reference_price(listing: dict) -> Decimal:
    prev = Decimal(listing["prev_close"] or 0)
    if prev > 0:
        return prev
    return Decimal(listing["ipo_price"])


def _wallet_balance(conn, actor_id: str, code: str) -> Decimal:
    row = currency_repo.account(conn, actor_id, code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _payload_order(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "side": row["side"],
        "type": row["type"],
        "price": str(Decimal(row["price"])) if row["price"] is not None else None,
        "quantity": int(row["quantity"]),
        "filled": int(row["filled"]),
        "remaining": int(row["quantity"]) - int(row["filled"]),
        "status": row["status"],
        "created_at": row["created_at"].isoformat(),
    }


def _payload_listing(conn, listing: dict) -> dict:
    last = Decimal(listing["last_price"] or 0)
    ref = _reference_price(listing)
    change = (last - ref) / ref if ref > 0 and last > 0 else Decimal(0)
    company = company_repo.by_id(conn, str(listing["company_id"]))
    return {
        "ticker": listing["ticker"],
        "company": company["name"] if company else "",
        "company_ticker": company["ticker"] if company else "",
        "status": listing["status"],
        "currency_code": listing["currency_code"],
        "last_price": str(last),
        "prev_close": str(ref),
        "change_pct": str(q4(change * 100)),
        "total_shares": int(listing["total_shares"]),
        "free_float": int(listing["free_float"]),
        "settlement_mode": listing["settlement_mode"],
        "shortable": bool(listing["shortable"]),
        "circuit_breaker_pct": str(Decimal(listing["circuit_breaker_pct"])),
        "halted_until": listing["halted_until"].isoformat() if listing["halted_until"] else None,
        "halt_reason": listing["halt_reason"] or "",
        "listed_at": listing["listed_at"].isoformat() if listing["listed_at"] else None,
    }


# ------------------------------------------------------------------ queries
def list_stocks(conn, status: str | None = "listed") -> list[dict]:
    rows = stock_repo.list_listings(conn, status=status)
    return [_payload_listing(conn, row) for row in rows]


def detail(conn, ticker: str) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    payload = _payload_listing(conn, listing)
    bids = stock_repo.book_bids(conn, str(listing["id"]), limit=200)
    asks = stock_repo.book_asks(conn, str(listing["id"]), limit=200)
    recent = stock_repo.trades_for(conn, str(listing["id"]), limit=20)
    company = company_repo.by_id(conn, str(listing["company_id"]))
    return {
        **payload,
        "order_book": {
            "bids": _levels(bids),
            "asks": _levels(asks, ascending=True),
        },
        "recent_trades": [
            {
                "price": str(Decimal(row["price"])),
                "quantity": int(row["quantity"]),
                "executed_at": row["executed_at"].isoformat(),
            }
            for row in recent
        ],
        "book_value": str(Decimal(company["book_value"])) if company else "0",
    }


def _levels(rows: list[dict], *, ascending: bool = False) -> list[dict]:
    levels: dict[Decimal, int] = {}
    for row in rows:
        price = Decimal(row["price"])
        levels[price] = levels.get(price, 0) + int(row["quantity"]) - int(row["filled"])
    ordered = sorted(levels.items(), reverse=not ascending)
    return [{"price": str(price), "quantity": qty} for price, qty in ordered][:10]


def candles(conn, ticker: str, interval: str = "1m", limit: int = 300, before=None) -> dict:
    if interval not in CANDLE_INTERVALS:
        raise InvalidArgument("周期仅支持 1m/5m/15m/1h/1d")
    limit = max(1, min(int(limit), 500))
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    rows = stock_repo.candles(conn, str(listing["id"]), interval, limit, before)
    return {
        "ticker": listing["ticker"],
        "interval": interval,
        "candles": [
            {
                "t": row["bucket_start"].isoformat(),
                "o": str(Decimal(row["open"])),
                "h": str(Decimal(row["high"])),
                "l": str(Decimal(row["low"])),
                "c": str(Decimal(row["close"])),
                "v": int(row["volume"]),
                "qv": str(Decimal(row["quote_volume"])),
                "n": int(row["trades"]),
            }
            for row in rows
        ],
    }


# ------------------------------------------------------------------ IPO
def ipo(
    conn,
    *,
    actor: dict,
    ticker: str,
    offer_shares: int,
    price: Decimal,
    settlement_mode: str = "t0",
    shortable: bool = True,
    idem_key: str | None = None,
) -> dict:
    ticker = ticker.strip().upper()
    company = company_repo.by_ticker(conn, ticker, for_update=True)
    if company is None:
        raise NotFound("公司不存在")
    if company["status"] != "private":
        raise Unprocessable("只有未上市的私有公司可以申请 IPO")
    if settlement_mode not in ("t0", "t1"):
        raise InvalidArgument("结算模式仅支持 t0/t1")
    price = q4(price)
    if price <= 0:
        raise InvalidArgument("发行价必须大于 0")
    if offer_shares <= 0:
        raise InvalidArgument("发行股数必须大于 0")
    if stock_repo.listing_by_ticker(conn, ticker) is not None:
        raise Unprocessable("该 ticker 已上市")

    stake = company_repo.holding(conn, actor["id"], str(company["id"]))
    owned = int(stake["shares"]) if stake else 0
    if Decimal(owned) < DIVIDEND_CONTROL * Decimal(company["shares_total"]):
        raise Forbidden("需要控股 50% 才能申请 IPO")
    age = _now() - company["created_at"]
    if age < timedelta(days=IPO_MIN_AGE_DAYS):
        raise Unprocessable(f"公司成立需满 {IPO_MIN_AGE_DAYS} 天")
    if Decimal(company["book_value"]) < IPO_MIN_BOOK_VALUE:
        raise Unprocessable(f"净资产需达到 {IPO_MIN_BOOK_VALUE} cc4")

    total_after = int(company["shares_total"]) + int(offer_shares)
    if Decimal(offer_shares) / Decimal(total_after) < IPO_MIN_FREE_FLOAT:
        raise Unprocessable("自由流通比例不得低于 20%")

    exchange = stock_repo.ensure_official_exchange(conn)

    listing = stock_repo.create_listing(
        conn,
        exchange_id=str(exchange["id"]),
        company_id=str(company["id"]),
        ticker=ticker,
        total_shares=total_after,
        free_float=int(offer_shares),
        ipo_price=price,
        settlement_mode=settlement_mode,
        circuit_breaker_pct=BREAKER_PCT,
        shortable=shortable,
    )
    company_repo.mark_public(
        conn, str(company["id"]), shares_total=total_after, free_float=int(offer_shares)
    )

    treasury_actor = str(company["treasury_actor_id"])
    # Old shareholders' company shares become tradable stock at the IPO price so
    # the book is not a one-sided treasury-only market.
    for stake in company_repo.holdings_of(conn, str(company["id"])):
        if int(stake["shares"]) <= 0:
            continue
        stock_repo.ensure_holder(conn, str(stake["actor_id"]), str(listing["id"]))
        stock_repo.credit_shares(
            conn,
            actor_id=str(stake["actor_id"]),
            listing_id=str(listing["id"]),
            quantity=int(stake["shares"]),
            price=price,
            locked_until=None,
        )
    stock_repo.ensure_holder(conn, treasury_actor, str(listing["id"]))
    stock_repo.credit_shares(
        conn,
        actor_id=treasury_actor,
        listing_id=str(listing["id"]),
        quantity=int(offer_shares),
        price=price,
        locked_until=None,
    )
    book_order = stock_repo.insert_order(
        conn,
        listing_id=str(listing["id"]),
        actor_id=treasury_actor,
        side="sell",
        order_type="limit",
        price=price,
        quantity=int(offer_shares),
    )
    return {
        "ticker": ticker,
        "listing_id": str(listing["id"]),
        "ipo_price": str(price),
        "offered_shares": int(offer_shares),
        "total_shares": total_after,
        "free_float": int(offer_shares),
        "settlement_mode": settlement_mode,
        "offer_order_id": str(book_order["id"]),
        "exchange": exchange["code"],
    }


# ------------------------------------------------------------------ orders
def place_order(
    conn,
    *,
    actor: dict,
    ticker: str,
    side: str,
    order_type: str,
    quantity: int,
    price: Decimal | None,
    idem_key: str | None = None,
) -> dict:
    if side not in ("buy", "sell"):
        raise InvalidArgument("side 仅支持 buy/sell，做空请用 /short")
    if order_type not in ("limit", "market"):
        raise InvalidArgument("type 仅支持 limit/market")
    if quantity <= 0:
        raise InvalidArgument("数量必须大于 0")
    listing = _lock_listing(conn, ticker)
    _assert_tradable(listing)

    value = q4(price) if price is not None else None
    if order_type == "limit" and (value is None or value <= 0):
        raise InvalidArgument("限价单必须给出正的价格")
    if order_type == "market":
        value = None

    actor_id = str(actor["id"])
    _wash_guard(conn, actor_id, str(listing["id"]))
    if side == "buy":
        _check_buy_funds(conn, actor_id, listing, order_type, value, quantity)
        _check_position_cap(conn, actor_id, listing, quantity)
    else:
        _check_sellable(conn, actor_id, listing, quantity)

    order = stock_repo.insert_order(
        conn,
        listing_id=str(listing["id"]),
        actor_id=actor_id,
        side=side,
        order_type=order_type,
        price=value,
        quantity=int(quantity),
    )
    trades, filled = _match(conn, listing, order)

    if filled >= int(order["quantity"]):
        status = "filled"
    elif order_type == "market":
        status = "cancelled"  # 05 §4.2: market remainder is cancelled, never rested
    elif filled == 0:
        status = "open"
    else:
        status = "partial"
    stock_repo.set_order_fill(conn, str(order["id"]), filled, status)

    fresh = stock_repo.order_by_id(conn, str(order["id"]))
    return {
        "ticker": listing["ticker"],
        **_payload_order(fresh),
        "avg_price": _avg_price(trades),
        "trades": [
            {
                "price": str(trade["price"]),
                "quantity": int(trade["quantity"]),
                "fee_buy": str(trade["fee_buy"]),
                "fee_sell": str(trade["fee_sell"]),
                "tax": str(trade["tax"]),
            }
            for trade in trades
        ],
    }


def _avg_price(trades: list[dict]) -> str | None:
    if not trades:
        return None
    notional = sum((Decimal(t["price"]) * int(t["quantity"]) for t in trades), Decimal(0))
    quantity = sum(int(t["quantity"]) for t in trades)
    if quantity <= 0:
        return None
    return str(q4(notional / quantity))


def _check_buy_funds(conn, actor_id: str, listing: dict, order_type: str,
                     price: Decimal | None, quantity: int) -> None:
    code = listing["currency_code"]
    available = _wallet_balance(conn, actor_id, code) - stock_repo.reserved_cash(conn, actor_id)
    if order_type == "limit":
        notional = q4(Decimal(price) * quantity)
        need = notional + _fee(notional)
    else:
        asks = stock_repo.book_asks(conn, str(listing["id"]), limit=1)
        if not asks:
            raise Unprocessable("当前没有卖盘")
        notional = q4(Decimal(asks[0]["price"]) * quantity)
        need = notional + _fee(notional)
    if available < need:
        raise InsufficientFunds(
            f"{code} 可用余额不足：需要 {need}（含手续费），可用 {available}"
        )


def _check_sellable(conn, actor_id: str, listing: dict, quantity: int) -> None:
    free = stock_repo.available_shares(conn, actor_id, str(listing["id"]))
    reserved = stock_repo.reserved_shares(conn, actor_id, str(listing["id"]))
    if free - reserved < quantity:
        raise Unprocessable(f"可卖股份不足：可用 {max(0, free - reserved)}，卖出 {quantity}")


def _check_position_cap(conn, actor_id: str, listing: dict, quantity: int) -> None:
    free_float = int(listing["free_float"])
    if free_float <= 0:
        return
    # Founders and other pre-IPO holders keep their promoter stock, which is not
    # float; the exchange cap only constrains accumulation through the book.
    if stock_repo.company_shareholder(conn, actor_id, str(listing["company_id"])):
        return
    held = stock_repo.holder(conn, actor_id, str(listing["id"]))
    current = int(held["shares"]) if held else 0
    if Decimal(current + quantity) > POSITION_CAP * free_float:
        raise Unprocessable(
            f"单账户单票持仓不得超过流通股本 10%（上限 {int(POSITION_CAP * free_float)} 股）"
        )


def _wash_guard(conn, actor_id: str, listing_id: str) -> None:
    """05 §6: flag round-trips at one price. Self-trades never match (see ``_match``),
    so what is left is an actor buying and selling the same name at one price more
    than three times inside a minute."""
    rows = stock_repo.actor_recent_trades(conn, actor_id, listing_id, seconds=60)
    if len(rows) < 6:
        return
    by_price: dict[Decimal, dict[str, int]] = {}
    for row in rows:
        bucket = by_price.setdefault(Decimal(row["price"]), {"buy": 0, "sell": 0})
        bucket[row["side"]] += 1
    for counts in by_price.values():
        if counts["buy"] >= 3 and counts["sell"] >= 3:
            raise Unprocessable("检测到疑似对倒：1 分钟内同价买卖过于频繁，请更换价格或稍后再试")


def _pick(book: list[dict], side: str, order_type: str, price: Decimal | None,
          levels: list[Decimal]) -> dict | None:
    for row in book:
        book_price = Decimal(row["price"])
        if order_type == "limit":
            if side == "buy" and book_price > Decimal(price):
                return None
            if side == "sell" and book_price < Decimal(price):
                return None
        elif book_price not in levels:
            if len(levels) >= MARKET_LEVELS:
                return None
            levels.append(book_price)
        return row
    return None


def _match(conn, listing: dict, order: dict) -> tuple[list[dict], int]:
    filled = 0
    quantity = int(order["quantity"])
    trades: list[dict] = []
    levels: list[Decimal] = []
    while filled < quantity:
        if order["side"] == "buy":
            book = stock_repo.book_asks(conn, str(listing["id"]))
        else:
            book = stock_repo.book_bids(conn, str(listing["id"]))
        book = [row for row in book if str(row["actor_id"]) != str(order["actor_id"])]
        counterparty = _pick(book, order["side"], order["type"], order["price"], levels)
        if counterparty is None:
            break
        take = min(quantity - filled, int(counterparty["quantity"]) - int(counterparty["filled"]))
        if take <= 0:  # pragma: no cover - query filters these out
            break
        price = Decimal(counterparty["price"])
        if order["side"] == "buy":
            buyer_order, seller_order = order, counterparty
        else:
            buyer_order, seller_order = counterparty, order
        try:
            trade = _settle_trade(conn, listing, buyer_order, seller_order, price, take)
        except InsufficientFunds:
            if order["side"] == "buy" and order["type"] == "market":
                break
            raise
        trades.append(trade)
        filled += take
        _bump_order(conn, str(counterparty["id"]), int(counterparty["filled"]) + take,
                    int(counterparty["quantity"]))
        _apply_breaker(conn, listing)
        listing = stock_repo.listing_by_id(conn, str(listing["id"]))
        if listing["halted_until"] is not None and listing["halted_until"] > _now():
            break
    return trades, filled


def _bump_order(conn, order_id: str, filled: int, quantity: int) -> None:
    status = "filled" if filled >= quantity else "partial"
    stock_repo.set_order_fill(conn, order_id, filled, status)


def _settle_trade(conn, listing: dict, buyer_order: dict, seller_order: dict,
                  price: Decimal, quantity: int) -> dict:
    """One fill: ledger, shares, trade row and candle upserts (05 §4.3/§5.1)."""
    code = listing["currency_code"]
    notional = q4(price * quantity)
    fee_buy = _fee(notional)
    fee_sell = _fee(notional)
    tax = _tax(notional)
    buyer = str(buyer_order["actor_id"])
    seller = str(seller_order["actor_id"])
    treasury = currency_service.system_actor(conn, currency_service.TREASURY)

    tx = currency_service.post(
        conn,
        kind="stock_trade",
        moves=[
            Move(buyer, code, -(notional + fee_buy)),
            Move(seller, code, notional - fee_sell - tax),
            Move(treasury["id"], code, fee_buy + fee_sell + tax),
        ],
        ref_type="stock_listing",
        ref_id=str(listing["id"]),
        memo=f"{listing['ticker']} {quantity}@{price}",
    )
    # 05 §11: the fee pool is recorded so the split job can move the shares later
    revenue_repo.collect(
        conn,
        kind="stock_fee",
        currency_code=code,
        amount=q4(fee_buy + fee_sell + tax),
        ref_type="stock_trade",
        ref_id=tx["tx_id"],
    )

    stock_repo.ensure_holder(conn, buyer, str(listing["id"]))
    stock_repo.ensure_holder(conn, seller, str(listing["id"]))
    stock_repo.debit_shares(
        conn, actor_id=seller, listing_id=str(listing["id"]), quantity=quantity
    )
    lock_until = _next_utc_midnight() if listing["settlement_mode"] == "t1" else None
    stock_repo.credit_shares(
        conn,
        actor_id=buyer,
        listing_id=str(listing["id"]),
        quantity=quantity,
        price=price,
        locked_until=lock_until,
    )

    trade = stock_repo.insert_trade(
        conn,
        listing_id=str(listing["id"]),
        buy_order_id=str(buyer_order["id"]),
        sell_order_id=str(seller_order["id"]),
        buyer_actor_id=buyer,
        seller_actor_id=seller,
        price=price,
        quantity=quantity,
        fee_buy=fee_buy,
        fee_sell=fee_sell,
        tax=tax,
        tx_id=tx["tx_id"],
    )

    executed = trade["executed_at"]
    for interval in CANDLE_INTERVALS:
        stock_repo.upsert_candle(
            conn,
            listing_id=str(listing["id"]),
            interval=interval,
            bucket_start=_bucket(executed, interval),
            price=price,
            quantity=quantity,
            notional=notional,
        )
    stock_repo.set_last_price(conn, str(listing["id"]), price)
    return trade


def _apply_breaker(conn, listing: dict) -> None:
    """05 §6: ±20 % halts for 15 minutes, ±30 % halts until the next session."""
    fresh = stock_repo.listing_by_id(conn, str(listing["id"]))
    last = Decimal(fresh["last_price"] or 0)
    ref = _reference_price(fresh)
    if ref <= 0 or last <= 0:
        return
    move = (last - ref) / ref
    if abs(move) >= HALT_PCT:
        stock_repo.set_halt(conn, str(fresh["id"]), _next_utc_midnight(),
                            f"单日振幅 {q4(move * 100)}% 触发停牌")
    elif abs(move) >= BREAKER_PCT:
        stock_repo.set_halt(conn, str(fresh["id"]), _now() + timedelta(minutes=15),
                            f"单日振幅 {q4(move * 100)}% 触发熔断")


def cancel_order(conn, *, actor: dict, order_id: str) -> dict:
    probe = stock_repo.order_by_id(conn, order_id)
    if probe is None:
        raise NotFound("委托不存在")
    if str(probe["actor_id"]) != str(actor["id"]) and not stock_repo.company_controlled_by(
        conn, str(probe["actor_id"]), str(actor["id"])
    ):
        raise Forbidden("只能撤销自己的委托")
    listing = stock_repo.listing_by_id(conn, str(probe["listing_id"]), for_update=True)
    order = stock_repo.order_by_id(conn, order_id, for_update=True)
    if order["status"] not in ("open", "partial"):
        raise Unprocessable(f"委托状态为 {order['status']}，无法撤销")
    stock_repo.close_order(conn, order_id, int(order["filled"]), "cancelled")
    fresh = stock_repo.order_by_id(conn, order_id)
    return {"ticker": listing["ticker"], **_payload_order(fresh)}


def my_orders(conn, actor: dict, ticker: str | None = None) -> list[dict]:
    listing_id = None
    if ticker:
        listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
        if listing is None:
            raise NotFound("该股票未上市")
        listing_id = str(listing["id"])
    rows = stock_repo.actor_orders(conn, str(actor["id"]), listing_id=listing_id)
    return [_payload_order(row) for row in rows]


def portfolio(conn, actor: dict) -> dict:
    actor_id = str(actor["id"])
    rows = conn.execute(
        """
        SELECT h.listing_id, h.shares, h.locked_shares, h.avg_cost, h.locked_until,
               l.ticker, l.last_price, l.status
          FROM stock_holders h JOIN stock_listings l ON l.id = h.listing_id
         WHERE h.actor_id = %s AND h.shares > 0
         ORDER BY h.shares DESC
        """,
        (actor_id,),
    ).fetchall()
    positions = []
    market_value = Decimal(0)
    for row in rows:
        shares = int(row["shares"])
        last = Decimal(row["last_price"] or 0)
        value = q4(last * shares)
        market_value += value
        positions.append(
            {
                "ticker": row["ticker"],
                "shares": shares,
                "locked_shares": int(row["locked_shares"]),
                "sellable": shares - int(row["locked_shares"]),
                "avg_cost": str(Decimal(row["avg_cost"])),
                "last_price": str(last),
                "market_value": str(value),
                "unrealized_pnl": str(q4((last - Decimal(row["avg_cost"])) * shares)),
                "locked_until": row["locked_until"].isoformat() if row["locked_until"] else None,
                "status": row["status"],
            }
        )
    shorts = [
        {
            "id": str(row["id"]),
            "ticker": row["ticker"],
            "quantity": int(row["quantity"]),
            "entry_price": str(Decimal(row["entry_price"])),
            "last_price": str(Decimal(row["last_price"] or 0)),
            "unrealized_pnl": str(
                q4((Decimal(row["entry_price"]) - Decimal(row["last_price"] or 0))
                   * int(row["quantity"]))
            ),
            "margin": str(Decimal(row["margin"])),
            "fee_paid": str(Decimal(row["fee_paid"])),
            "status": row["status"],
        }
        for row in stock_repo.shorts_of(conn, actor_id)
    ]
    return {
        "positions": positions,
        "shorts": shorts,
        "market_value": str(q4(market_value)),
        "cash": str(_wallet_balance(conn, actor_id, "cc4")),
    }


# ------------------------------------------------------------------ margin
def margin_info(conn, actor: dict) -> dict:
    actor_id = str(actor["id"])
    account = stock_repo.margin_account(conn, actor_id)
    shorts = stock_repo.shorts_of(conn, actor_id)
    liability = sum(
        (Decimal(row["last_price"] or 0) * int(row["quantity"]) for row in shorts), Decimal(0)
    )
    cash = Decimal(account["cash"]) if account else Decimal(0)
    return {
        "account": {
            "currency_code": "cc4",
            "cash": str(cash),
            "status": account["status"] if account else "closed",
        },
        "positions": [
            {
                "id": str(row["id"]),
                "ticker": row["ticker"],
                "quantity": int(row["quantity"]),
                "entry_price": str(Decimal(row["entry_price"])),
                "last_price": str(Decimal(row["last_price"] or 0)),
                "margin": str(Decimal(row["margin"])),
                "fee_paid": str(Decimal(row["fee_paid"])),
                "status": row["status"],
            }
            for row in shorts
        ],
        "liability": str(q4(liability)),
        "margin_ratio": str(q4(cash / liability)) if liability > 0 else None,
        "initial_margin": str(INITIAL_MARGIN),
        "maintenance_margin": str(MAINTENANCE_MARGIN),
    }


def _escrow_actor(conn) -> dict:
    return currency_service.system_actor(conn, "escrow")


def _move_to_margin(conn, *, actor: dict, amount: Decimal, memo: str) -> None:
    if amount <= 0:
        return
    escrow = _escrow_actor(conn)
    currency_service.post(
        conn,
        kind="stock_margin_in",
        moves=[
            Move(str(actor["id"]), "cc4", -amount),
            Move(escrow["id"], "cc4", amount),
        ],
        ref_type="margin_account",
        ref_id=str(actor["id"]),
        memo=memo,
    )
    stock_repo.ensure_margin_account(conn, str(actor["id"]))
    stock_repo.adjust_margin_cash(conn, str(actor["id"]), amount)


def _move_from_margin(conn, *, actor: dict, amount: Decimal, memo: str) -> None:
    if amount <= 0:
        return
    escrow = _escrow_actor(conn)
    currency_service.post(
        conn,
        kind="stock_margin_out",
        moves=[
            Move(escrow["id"], "cc4", -amount),
            Move(str(actor["id"]), "cc4", amount),
        ],
        ref_type="margin_account",
        ref_id=str(actor["id"]),
        memo=memo,
    )
    stock_repo.adjust_margin_cash(conn, str(actor["id"]), -amount)


def deposit_margin(conn, *, actor: dict, amount: Decimal, idem_key: str | None = None) -> dict:
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("保证金存款必须大于 0")
    stock_repo.ensure_margin_account(conn, str(actor["id"]))
    _move_to_margin(conn, actor=actor, amount=value, memo="margin deposit")
    account = stock_repo.margin_account(conn, str(actor["id"]))
    return {"cash": str(Decimal(account["cash"])), "status": account["status"]}


# ------------------------------------------------------------------ shorting
def lend_shares(conn, *, actor: dict, ticker: str, quantity: int, fee_bps: int = 300,
                days: int = 30) -> dict:
    listing = _lock_listing(conn, ticker)
    if quantity <= 0:
        raise InvalidArgument("出借数量必须大于 0")
    if not 100 <= int(fee_bps) <= 1000:
        raise InvalidArgument("借券费需在 1%-10% 年化之间")
    free = stock_repo.available_shares(conn, str(actor["id"]), str(listing["id"]))
    reserved = stock_repo.reserved_shares(conn, str(actor["id"]), str(listing["id"]))
    if free - reserved < quantity:
        raise Unprocessable("可出借股份不足")
    pool = stock_repo.lending_quantity(conn, str(listing["id"]), "open")
    if Decimal(pool + quantity) > SHORT_POOL_CAP * int(listing["free_float"]):
        raise Unprocessable("单票借券池不得超过流通股本 15%")
    row = stock_repo.insert_lending(
        conn,
        listing_id=str(listing["id"]),
        lender_actor_id=str(actor["id"]),
        quantity=int(quantity),
        fee_bps=int(fee_bps),
        due_at=_now() + timedelta(days=max(1, int(days))),
    )
    return {
        "lending_id": str(row["id"]),
        "ticker": listing["ticker"],
        "quantity": int(row["quantity"]),
        "fee_bps": int(row["fee_bps"]),
        "due_at": row["due_at"].isoformat() if row["due_at"] else None,
    }


def _borrow(conn, listing: dict, *, subscriber: dict, quantity: int) -> list[dict]:
    """Allocate stock from the lending pool, splitting offers when needed."""
    remaining = quantity
    slices: list[dict] = []
    for offer in stock_repo.open_lending(conn, str(listing["id"]), for_update=True):
        if remaining <= 0:
            break
        take = min(remaining, int(offer["quantity"]))
        if take <= 0:
            continue
        stock_repo.mark_lending(
            conn,
            str(offer["id"]),
            status="borrowed",
            borrower_actor_id=str(subscriber["id"]),
            quantity=take,
        )
        if take < int(offer["quantity"]):
            stock_repo.insert_lending(
                conn,
                listing_id=str(listing["id"]),
                lender_actor_id=str(offer["lender_actor_id"]),
                quantity=int(offer["quantity"]) - take,
                fee_bps=int(offer["fee_bps"]),
                due_at=offer["due_at"],
            )
        slices.append({
            "lending_id": str(offer["id"]),
            "quantity": take,
            "fee_bps": int(offer["fee_bps"]),
            "lender_actor_id": str(offer["lender_actor_id"]),
            "due_at": offer["due_at"],
        })
        remaining -= take
    if remaining > 0:
        raise Unprocessable(f"券源不足，还差 {remaining} 股可借")
    return slices


def open_short(conn, *, actor: dict, ticker: str, quantity: int,
               idem_key: str | None = None) -> dict:
    if quantity <= 0:
        raise InvalidArgument("开空数量必须大于 0")
    listing = _lock_listing(conn, ticker)
    _assert_tradable(listing)
    if not listing["shortable"]:
        raise Unprocessable("该股票当前禁止做空")
    pool_used = stock_repo.short_quantity(conn, str(listing["id"]))
    if Decimal(pool_used + quantity) > SHORT_POOL_CAP * int(listing["free_float"]):
        raise Unprocessable("单票空头持仓不得超过流通股本 15%")

    bids = stock_repo.book_bids(conn, str(listing["id"]))
    depth = sum(int(row["quantity"]) - int(row["filled"]) for row in bids)
    if depth < quantity:
        raise Unprocessable(f"买盘深度不足，最多可开空 {depth} 股")

    actor_id = str(actor["id"])
    stock_repo.ensure_margin_account(conn, actor_id)
    slices = _borrow(conn, listing, subscriber=actor, quantity=int(quantity))

    stock_repo.ensure_holder(conn, actor_id, str(listing["id"]))
    stock_repo.credit_shares(
        conn,
        actor_id=actor_id,
        listing_id=str(listing["id"]),
        quantity=int(quantity),
        price=_reference_price(listing),
        locked_until=None,
    )
    order = stock_repo.insert_order(
        conn,
        listing_id=str(listing["id"]),
        actor_id=actor_id,
        side="sell",
        order_type="market",
        price=None,
        quantity=int(quantity),
    )
    trades, filled = _match(conn, listing, order)
    stock_repo.set_order_fill(conn, str(order["id"]), filled,
                              "filled" if filled >= int(quantity) else "cancelled")
    if filled <= 0:
        for chunk in slices:
            stock_repo.mark_lending(conn, chunk["lending_id"], status="open",
                                    borrower_actor_id=None)
        raise Unprocessable("没有可成交的买盘")
    if filled < int(quantity):
        # borrowed but unsold shares never stay on the book
        stock_repo.debit_shares(
            conn, actor_id=actor_id, listing_id=str(listing["id"]),
            quantity=int(quantity) - filled,
        )

    notional = sum((Decimal(t["price"]) * int(t["quantity"]) for t in trades), Decimal(0))
    avg_price = q4(notional / filled)
    proceeds = q4(notional) - _fee(q4(notional)) - _tax(q4(notional))
    _move_to_margin(conn, actor=actor, amount=proceeds, memo="short sale proceeds")
    required = q4(notional * INITIAL_MARGIN)
    cash = Decimal(stock_repo.margin_account(conn, actor_id)["cash"])
    if cash < required:
        _move_to_margin(conn, actor=actor, amount=required - cash, memo="initial margin")

    positions = []
    uncovered = filled
    for chunk in slices:
        take = min(uncovered, int(chunk["quantity"]))
        if take < int(chunk["quantity"]):
            stock_repo.insert_lending(
                conn,
                listing_id=str(listing["id"]),
                lender_actor_id=str(chunk["lender_actor_id"]),
                quantity=int(chunk["quantity"]) - take,
                fee_bps=int(chunk["fee_bps"]),
                due_at=chunk.get("due_at"),
            )
            stock_repo.mark_lending(conn, chunk["lending_id"], quantity=take, status="borrowed")
        if take <= 0:
            stock_repo.mark_lending(conn, chunk["lending_id"], status="open",
                                    borrower_actor_id=None)
            continue
        row = stock_repo.insert_short(
            conn,
            actor_id=actor_id,
            listing_id=str(listing["id"]),
            quantity=take,
            entry_price=avg_price,
            borrowed_from=chunk["lending_id"],
            margin=q4(avg_price * take * INITIAL_MARGIN),
        )
        positions.append({"id": str(row["id"]), "quantity": int(row["quantity"])})
        uncovered -= take
    account = stock_repo.margin_account(conn, actor_id)
    return {
        "ticker": listing["ticker"],
        "filled": filled,
        "avg_price": str(avg_price),
        "proceeds": str(proceeds),
        "margin_cash": str(Decimal(account["cash"])),
        "positions": positions,
    }


def cover_short(conn, *, actor: dict, ticker: str, quantity: int | None = None,
                idem_key: str | None = None) -> dict:
    listing = _lock_listing(conn, ticker)
    actor_id = str(actor["id"])
    positions = stock_repo.open_shorts(conn, actor_id=actor_id, listing_id=str(listing["id"]),
                                       for_update=True)
    if not positions:
        raise Unprocessable("没有需要平仓的空头")
    total = sum(int(row["quantity"]) for row in positions)
    wanted = total if quantity is None else min(int(quantity), total)
    if wanted <= 0:
        raise InvalidArgument("还券数量必须大于 0")

    asks = stock_repo.book_asks(conn, str(listing["id"]))
    depth = sum(int(row["quantity"]) - int(row["filled"]) for row in asks)
    if depth < wanted:
        raise Unprocessable(f"卖盘深度不足，最多可还券 {depth} 股")

    budget = sum(
        (q4(Decimal(row["price"]) * (int(row["quantity"]) - int(row["filled"])))
         for row in asks), Decimal(0)
    )
    budget = q4(budget / max(depth, 1) * wanted)
    budget = q4(budget * Decimal("1.01")) + Decimal(1)
    account = stock_repo.margin_account(conn, actor_id) or stock_repo.ensure_margin_account(
        conn, actor_id
    )
    if Decimal(account["cash"]) < budget:
        raise InsufficientFunds(
            f"保证金可用余额不足：预计需要 {budget} cc4，当前 {account['cash']}"
        )
    _move_from_margin(conn, actor=actor, amount=budget, memo="cover budget")

    order = stock_repo.insert_order(
        conn,
        listing_id=str(listing["id"]),
        actor_id=actor_id,
        side="buy",
        order_type="market",
        price=None,
        quantity=wanted,
    )
    trades, filled = _match(conn, listing, order)
    stock_repo.set_order_fill(conn, str(order["id"]), filled,
                              "filled" if filled >= wanted else "cancelled")
    if filled <= 0:
        _move_to_margin(conn, actor=actor, amount=budget, memo="cover refund")
        raise Unprocessable("没有可成交的卖盘")

    cost = Decimal(0)
    for trade in trades:
        cost += q4(Decimal(trade["price"]) * int(trade["quantity"])) + Decimal(trade["fee_buy"])
    refund = q4(budget - cost)
    if refund > 0:
        _move_to_margin(conn, actor=actor, amount=refund, memo="cover refund")

    remaining = filled
    closed = []
    for position in positions:
        if remaining <= 0:
            break
        take = min(remaining, int(position["quantity"]))
        left = int(position["quantity"]) - take
        status = "closed" if left == 0 else "open"
        stock_repo.close_short(
            conn,
            str(position["id"]),
            remaining=left if left > 0 else None,
            status=status,
            closed_price=Decimal(trades[-1]["price"]),
            fee_paid=Decimal(0),
        )
        if position["borrowed_from"]:
            _return_lending(conn, str(position["borrowed_from"]), take)
        closed.append({"id": str(position["id"]), "quantity": take})
        remaining -= take

    account = stock_repo.margin_account(conn, actor_id)
    return {
        "ticker": listing["ticker"],
        "covered": filled,
        "cost": str(q4(cost)),
        "margin_cash": str(Decimal(account["cash"])),
        "positions": closed,
    }


def _return_lending(conn, lending_id: str, quantity: int) -> None:
    row = conn.execute(
        "SELECT id, quantity, status FROM securities_lending WHERE id = %s FOR UPDATE",
        (lending_id,),
    ).fetchone()
    if row is None:
        return
    left = int(row["quantity"]) - quantity
    if left <= 0:
        stock_repo.mark_lending(conn, lending_id, status="returned")
    else:
        stock_repo.mark_lending(conn, lending_id, quantity=left, status="borrowed")


# ------------------------------------------------------------------ dividends
def pay_dividend(conn, *, actor: dict, ticker: str, per_share: Decimal,
                 idem_key: str | None = None) -> dict:
    value = q4(per_share)
    if value <= 0:
        raise InvalidArgument("每股分红必须大于 0")
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    company = company_repo.by_ticker(conn, str(listing["ticker"]), for_update=True)
    if company is None:
        raise NotFound("公司不存在")
    stake = company_repo.holding(conn, str(actor["id"]), str(company["id"]))
    owned = int(stake["shares"]) if stake else 0
    if Decimal(owned) < DIVIDEND_CONTROL * Decimal(company["shares_total"]):
        raise Forbidden("需要控股 50% 才能宣布分红")

    holders = stock_repo.holders_of(conn, str(listing["id"]))
    if not holders:
        raise Unprocessable("没有登记在册的股东")
    payouts = [
        (str(row["actor_id"]), q4(value * int(row["shares"])))
        for row in holders
        if int(row["shares"]) > 0
    ]
    total = sum((amount for _, amount in payouts), Decimal(0))
    treasury_actor = str(company["treasury_actor_id"])
    moves = [Move(treasury_actor, listing["currency_code"], -total)]
    moves += [Move(holder, listing["currency_code"], amount) for holder, amount in payouts]
    tx = currency_service.post(
        conn,
        kind="stock_dividend",
        moves=moves,
        ref_type="stock_listing",
        ref_id=str(listing["id"]),
        idem_key=idem_key,
        memo=f"{listing['ticker']} dividend {value}/share",
    )
    record = stock_repo.insert_dividend(
        conn,
        company_id=str(company["id"]),
        listing_id=str(listing["id"]),
        per_share=value,
        total_paid=total,
        tx_id=tx["tx_id"],
        record_at=_now(),
        pay_at=_now(),
    )
    return {
        "ticker": listing["ticker"],
        "per_share": str(value),
        "total_paid": str(total),
        "holders": len(payouts),
        "dividend_id": str(record["id"]),
    }


def dividends(conn, ticker: str) -> list[dict]:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    rows = stock_repo.dividends_for(conn, listing_id=str(listing["id"]))
    return [
        {
            "id": str(row["id"]),
            "per_share": str(Decimal(row["per_share"])),
            "total_paid": str(Decimal(row["total_paid"])),
            "status": row["status"],
            "record_at": row["record_at"].isoformat(),
            "pay_at": row["pay_at"].isoformat(),
        }
        for row in rows
    ]


# ------------------------------------------------------------------ delisting
def delisting_status(conn, ticker: str) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    case = stock_repo.current_delisting(conn, str(listing["id"]))
    return {
        "ticker": listing["ticker"],
        "status": listing["status"],
        "case": {
            "id": str(case["id"]),
            "reason": case["reason"],
            "status": case["status"],
            "last_price": str(Decimal(case["last_price"])),
            "triggered_at": case["triggered_at"].isoformat(),
            "settled_at": case["settled_at"].isoformat() if case["settled_at"] else None,
        }
        if case
        else None,
    }


def trigger_delisting(conn, listing: dict, reason: str) -> dict:
    case = stock_repo.current_delisting(conn, str(listing["id"]))
    if case is not None:
        return case
    case = stock_repo.insert_delisting(
        conn,
        listing_id=str(listing["id"]),
        reason=reason,
        last_price=Decimal(listing["last_price"] or listing["ipo_price"]),
    )
    stock_repo.set_listing_status(conn, str(listing["id"]), "suspended")
    stock_repo.set_halt(conn, str(listing["id"]), None, f"退市程序：{reason}")
    return case


def settle_delisting(conn, ticker: str) -> dict:
    """Close the case: shares become a liquidation claim handled by 08."""
    listing = _lock_listing(conn, ticker)
    case = stock_repo.current_delisting(conn, str(listing["id"]))
    if case is None:
        raise Unprocessable("该股票没有进行中的退市程序")
    for holder in stock_repo.holders_of(conn, str(listing["id"])):
        stock_repo.debit_shares(
            conn,
            actor_id=str(holder["actor_id"]),
            listing_id=str(listing["id"]),
            quantity=int(holder["shares"]),
        )
    for position in stock_repo.open_shorts(conn, listing_id=str(listing["id"]), for_update=True):
        stock_repo.close_short(
            conn,
            str(position["id"]),
            remaining=None,
            status="closed",
            closed_price=Decimal(listing["last_price"] or 0),
            fee_paid=Decimal(0),
        )
        if position["borrowed_from"]:
            _return_lending(conn, str(position["borrowed_from"]), int(position["quantity"]))
    stock_repo.settle_delisting(conn, str(case["id"]))
    stock_repo.set_listing_status(conn, str(listing["id"]), "delisted")
    return {"ticker": listing["ticker"], "case_id": str(case["id"]), "status": "settled"}


# ------------------------------------------------------------------ jobs
def daily_tick(conn) -> dict:
    """UTC day change: roll the daily summary, unlock T+1, scan for delisting."""
    unlocked = stock_repo.unlock_due(conn)
    yesterday = _now().date() - timedelta(days=1)
    rolled, triggered = 0, []
    for listing in stock_repo.list_listings(conn, status="listed"):
        listing_id = str(listing["id"])
        stats = stock_repo.day_bounds(conn, listing_id, yesterday)
        edges = stock_repo.first_last_trade(conn, listing_id, yesterday)
        if stats and int(stats["trades"] or 0) > 0:
            prev = stock_repo.last_daily(conn, listing_id, before=yesterday)
            prev_close = Decimal(prev["close"]) if prev else Decimal(listing["ipo_price"])
            close = Decimal(edges["close"])
            stock_repo.upsert_daily(
                conn,
                listing_id=listing_id,
                trade_date=yesterday,
                open_price=Decimal(edges["open"]),
                high=Decimal(stats["high"]),
                low=Decimal(stats["low"]),
                close=close,
                prev_close=prev_close,
                volume=int(stats["volume"] or 0),
                quote_volume=Decimal(stats["quote_volume"] or 0),
                trades=int(stats["trades"] or 0),
            )
            stock_repo.set_prev_close(conn, listing_id, close)
            rolled += 1
        reason = _delisting_reason(conn, listing)
        if reason:
            trigger_delisting(conn, listing, reason)
            triggered.append({"ticker": listing["ticker"], "reason": reason})
    stock_repo.clear_expired_halt(conn)
    return {"unlocked_holders": unlocked, "daily_rolled": rolled, "delisting": triggered}


def _delisting_reason(conn, listing: dict) -> str | None:
    listing_id = str(listing["id"])
    series = stock_repo.daily_series(conn, listing_id, limit=20)
    if len(series) >= 20 and all(Decimal(row["close"]) <= MIN_FEE for row in series):
        return "连续 20 个交易日收盘价为最小报价单位"
    today = _now().date()
    idle = conn.execute(
        "SELECT MAX(executed_at) AS last FROM stock_trades WHERE listing_id = %s",
        (listing_id,),
    ).fetchone()
    last = idle["last"] if idle else None
    if last is None:
        listed_at = listing["listed_at"]
        if listed_at is not None and (_now() - listed_at).days >= 10:
            return "连续 10 个交易日无成交"
    elif (today - last.date()).days >= 10:
        return "连续 10 个交易日无成交"
    company = company_repo.by_id(conn, str(listing["company_id"]))
    if company is not None:
        row = conn.execute(
            "SELECT book_value FROM companies WHERE id = %s", (str(company["id"]),)
        ).fetchone()
        if row is not None and Decimal(row["book_value"]) < 0:
            return "净资产为负且无重整计划"
    return None


def margin_tick(conn) -> dict:
    """Daily borrow fee accrual plus maintenance check (05 §1.2)."""
    fee_charged = 0
    called, forced = [], []
    for listing in stock_repo.list_listings(conn, status="listed"):
        listing_id = str(listing["id"])
        for position in stock_repo.open_shorts(conn, listing_id=listing_id, for_update=True):
            actor_id = str(position["actor_id"])
            account = stock_repo.margin_account(conn, actor_id, for_update=True)
            if account is None:
                continue
            entry = Decimal(position["entry_price"])
            quantity = int(position["quantity"])
            due = stock_repo.due_lending(conn, str(position["borrowed_from"])) if position[
                "borrowed_from"
            ] else None
            fee_bps = int(due["fee_bps"]) if due else 300
            fee = q4(entry * quantity * Decimal(fee_bps) / Decimal(10_000) / Decimal(365))
            if Decimal(account["cash"]) >= fee:
                _move_from_margin(conn, actor={"id": actor_id}, amount=fee, memo="borrow fee")
                if due is not None:
                    currency_service.post(
                        conn,
                        kind="stock_lending_fee",
                        moves=[
                            Move(actor_id, "cc4", -fee),
                            Move(str(due["lender_actor_id"]), "cc4", fee),
                        ],
                        ref_type="securities_lending",
                        ref_id=str(due["id"]),
                        memo="stock borrow fee",
                    )
                stock_repo.add_short_fee(conn, str(position["id"]), fee)
                fee_charged += 1
            last = Decimal(listing["last_price"] or entry)
            equity = Decimal(account["cash"]) + (entry - last) * quantity
            liability = last * quantity
            if liability <= 0:
                continue
            ratio = equity / liability
            if ratio < FORCE_MARGIN:
                stock_repo.set_margin_status(conn, actor_id, "liquidating")
                forced.append({"actor_id": actor_id, "ticker": listing["ticker"]})
            elif ratio < MAINTENANCE_MARGIN:
                stock_repo.set_margin_status(conn, actor_id, "margin_call")
                called.append({"actor_id": actor_id, "ticker": listing["ticker"]})
    return {"fee_charged": fee_charged, "margin_calls": called, "forced": forced}
