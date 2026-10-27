"""Stock persistence: listings, order book, trades, candles, margin, delisting.

Only SQL lives here; every balance or share change is driven by
``domain.stock_service`` so that the ledger stays the single source of truth
(05 §10).
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal

LISTING_COLUMNS = (
    "id, exchange_id, company_id, ticker, currency_code, total_shares, free_float, "
    "status, ipo_price, last_price, prev_close, listed_at, settlement_mode, "
    "circuit_breaker_pct, shortable, halted_until, halt_reason, created_at"
)


# ------------------------------------------------------------------ exchange
def exchange_by_code(conn, code: str) -> dict | None:
    return conn.execute(
        "SELECT id, code, name, kind, operator_actor_id, currency_code, status "
        "FROM exchanges WHERE code = %s",
        (code,),
    ).fetchone()


def official_exchange(conn) -> dict | None:
    return conn.execute(
        "SELECT id, code, name, kind, currency_code, status FROM exchanges "
        "WHERE kind = 'official' AND status = 'active' ORDER BY created_at LIMIT 1"
    ).fetchone()


def ensure_official_exchange(conn, *, code: str = "CUEX", name: str = "宇宙联合交易所",
                             currency_code: str = "cc4") -> dict:
    """Seeded by 0112; re-created on demand so a truncated test DB still works."""
    conn.execute(
        """
        INSERT INTO exchanges (code, name, kind, currency_code, status)
        VALUES (%s, %s, 'official', %s, 'active')
        ON CONFLICT (code) DO NOTHING
        """,
        (code, name, currency_code),
    )
    row = exchange_by_code(conn, code)
    if row is not None:
        return row
    fallback = official_exchange(conn)  # pragma: no cover - only if the code was renamed
    if fallback is None:
        raise RuntimeError("official exchange missing")
    return fallback


# ------------------------------------------------------------------ listings
def listing_by_ticker(conn, ticker: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {LISTING_COLUMNS} FROM stock_listings WHERE ticker = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (ticker,)).fetchone()


def listing_by_id(conn, listing_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {LISTING_COLUMNS} FROM stock_listings WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (listing_id,)).fetchone()


def list_listings(conn, *, status: str | None = None, limit: int = 200) -> list[dict]:
    if status:
        return conn.execute(
            f"SELECT {LISTING_COLUMNS} FROM stock_listings WHERE status = %s "
            "ORDER BY listed_at DESC NULLS LAST LIMIT %s",
            (status, limit),
        ).fetchall()
    return conn.execute(
        f"SELECT {LISTING_COLUMNS} FROM stock_listings "
        "ORDER BY listed_at DESC NULLS LAST LIMIT %s",
        (limit,),
    ).fetchall()


def create_listing(
    conn,
    *,
    exchange_id: str,
    company_id: str,
    ticker: str,
    total_shares: int,
    free_float: int,
    ipo_price: Decimal,
    settlement_mode: str,
    circuit_breaker_pct: Decimal,
    shortable: bool,
    status: str = "listed",
) -> dict:
    return conn.execute(
        f"""
        INSERT INTO stock_listings
               (exchange_id, company_id, ticker, total_shares, free_float, ipo_price,
                settlement_mode, circuit_breaker_pct, shortable, status, last_price,
                prev_close, listed_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
        RETURNING {LISTING_COLUMNS}
        """,
        (
            exchange_id,
            company_id,
            ticker,
            total_shares,
            free_float,
            ipo_price,
            settlement_mode,
            circuit_breaker_pct,
            shortable,
            status,
            ipo_price,
            ipo_price,
        ),
    ).fetchone()


def set_listing_status(conn, listing_id: str, status: str) -> None:
    conn.execute("UPDATE stock_listings SET status = %s WHERE id = %s", (status, listing_id))


def set_last_price(conn, listing_id: str, price: Decimal) -> None:
    conn.execute("UPDATE stock_listings SET last_price = %s WHERE id = %s", (price, listing_id))


def set_prev_close(conn, listing_id: str, price: Decimal) -> None:
    conn.execute("UPDATE stock_listings SET prev_close = %s WHERE id = %s", (price, listing_id))


def set_halt(conn, listing_id: str, until: datetime | None, reason: str = "") -> None:
    conn.execute(
        "UPDATE stock_listings SET halted_until = %s, halt_reason = %s WHERE id = %s",
        (until, reason, listing_id),
    )


def clear_expired_halt(conn) -> int:
    row = conn.execute(
        "UPDATE stock_listings SET halted_until = NULL, halt_reason = '' "
        "WHERE halted_until IS NOT NULL AND halted_until <= now() RETURNING id"
    ).fetchall()
    return len(row)


# ------------------------------------------------------------------ orders
ORDER_COLUMNS = (
    "id, listing_id, actor_id, side, type, price, quantity, filled, status, "
    "created_at, updated_at"
)


def insert_order(
    conn,
    *,
    listing_id: str,
    actor_id: str,
    side: str,
    order_type: str,
    price: Decimal | None,
    quantity: int,
) -> dict:
    return conn.execute(
        f"""
        INSERT INTO stock_orders (listing_id, actor_id, side, type, price, quantity)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING {ORDER_COLUMNS}
        """,
        (listing_id, actor_id, side, order_type, price, quantity),
    ).fetchone()


def order_by_id(conn, order_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {ORDER_COLUMNS} FROM stock_orders WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (order_id,)).fetchone()


def book_bids(conn, listing_id: str, limit: int = 50) -> list[dict]:
    """Resting buys, best price first, oldest first inside a price level."""
    return conn.execute(
        f"SELECT {ORDER_COLUMNS} FROM stock_orders "
        "WHERE listing_id = %s AND side = 'buy' AND status IN ('open','partial') "
        "  AND quantity > filled "
        "ORDER BY price DESC, created_at ASC, id ASC LIMIT %s",
        (listing_id, limit),
    ).fetchall()


def book_asks(conn, listing_id: str, limit: int = 50) -> list[dict]:
    return conn.execute(
        f"SELECT {ORDER_COLUMNS} FROM stock_orders "
        "WHERE listing_id = %s AND side = 'sell' AND status IN ('open','partial') "
        "  AND quantity > filled "
        "ORDER BY price ASC, created_at ASC, id ASC LIMIT %s",
        (listing_id, limit),
    ).fetchall()


def set_order_fill(conn, order_id: str, filled: int, status: str) -> None:
    conn.execute(
        "UPDATE stock_orders SET filled = %s, status = %s, updated_at = now() WHERE id = %s",
        (filled, status, order_id),
    )


def close_order(conn, order_id: str, filled: int, status: str) -> None:
    conn.execute(
        "UPDATE stock_orders SET filled = %s, status = %s, updated_at = now() WHERE id = %s",
        (filled, status, order_id),
    )


def actor_orders(conn, actor_id: str, *, listing_id: str | None = None, limit: int = 100) -> list[dict]:
    if listing_id:
        return conn.execute(
            f"SELECT {ORDER_COLUMNS} FROM stock_orders WHERE actor_id = %s AND listing_id = %s "
            "ORDER BY created_at DESC LIMIT %s",
            (actor_id, listing_id, limit),
        ).fetchall()
    return conn.execute(
        f"SELECT {ORDER_COLUMNS} FROM stock_orders WHERE actor_id = %s "
        "ORDER BY created_at DESC LIMIT %s",
        (actor_id, limit),
    ).fetchall()


def reserved_cash(conn, actor_id: str) -> Decimal:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(price * (quantity - filled)), 0) AS reserved
          FROM stock_orders
         WHERE actor_id = %s AND side = 'buy' AND type = 'limit'
           AND status IN ('open','partial')
        """,
        (actor_id,),
    ).fetchone()
    return Decimal(row["reserved"])


def reserved_shares(conn, actor_id: str, listing_id: str) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(quantity - filled), 0) AS reserved
          FROM stock_orders
         WHERE actor_id = %s AND listing_id = %s AND side = 'sell'
           AND status IN ('open','partial')
        """,
        (actor_id, listing_id),
    ).fetchone()
    return int(row["reserved"])


# ------------------------------------------------------------------ trades
def insert_trade(
    conn,
    *,
    listing_id: str,
    buy_order_id: str,
    sell_order_id: str,
    buyer_actor_id: str,
    seller_actor_id: str,
    price: Decimal,
    quantity: int,
    fee_buy: Decimal,
    fee_sell: Decimal,
    tax: Decimal,
    tx_id: str | None,
) -> dict:
    return conn.execute(
        """
        INSERT INTO stock_trades
               (listing_id, buy_order_id, sell_order_id, buyer_actor_id, seller_actor_id,
                price, quantity, fee_buy, fee_sell, tax, tx_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, price, quantity, fee_buy, fee_sell, tax, executed_at
        """,
        (
            listing_id,
            buy_order_id,
            sell_order_id,
            buyer_actor_id,
            seller_actor_id,
            price,
            quantity,
            fee_buy,
            fee_sell,
            tax,
            tx_id,
        ),
    ).fetchone()


def trades_for(conn, listing_id: str, limit: int = 50) -> list[dict]:
    return conn.execute(
        "SELECT price, quantity, executed_at FROM stock_trades "
        "WHERE listing_id = %s ORDER BY executed_at DESC LIMIT %s",
        (listing_id, limit),
    ).fetchall()


def actor_recent_trades(conn, actor_id: str, listing_id: str, seconds: int = 60) -> list[dict]:
    return conn.execute(
        """
        SELECT price, executed_at,
               CASE WHEN buyer_actor_id = %s THEN 'buy' ELSE 'sell' END AS side
          FROM stock_trades
         WHERE listing_id = %s AND (buyer_actor_id = %s OR seller_actor_id = %s)
           AND executed_at > now() - (%s || ' seconds')::interval
         ORDER BY executed_at DESC
        """,
        (actor_id, listing_id, actor_id, actor_id, seconds),
    ).fetchall()


def actor_trade_count(conn, listing_id: str, day) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM stock_trades WHERE listing_id = %s AND executed_at::date = %s",
        (listing_id, day),
    ).fetchone()
    return int(row["n"])


def day_bounds(conn, listing_id: str, day) -> dict | None:
    return conn.execute(
        """
        SELECT MIN(price) AS low, MAX(price) AS high, SUM(quantity) AS volume,
               SUM(price * quantity) AS quote_volume, COUNT(*) AS trades
          FROM stock_trades
         WHERE listing_id = %s AND executed_at::date = %s
        """,
        (listing_id, day),
    ).fetchone()


def first_last_trade(conn, listing_id: str, day) -> dict | None:
    return conn.execute(
        """
        SELECT
          (SELECT price FROM stock_trades WHERE listing_id = %(lid)s
             AND executed_at::date = %(day)s ORDER BY executed_at ASC LIMIT 1) AS open,
          (SELECT price FROM stock_trades WHERE listing_id = %(lid)s
             AND executed_at::date = %(day)s ORDER BY executed_at DESC LIMIT 1) AS close
        """,
        {"lid": listing_id, "day": day},
    ).fetchone()


# ------------------------------------------------------------------ candles
def upsert_candle(
    conn,
    *,
    listing_id: str,
    interval: str,
    bucket_start: datetime,
    price: Decimal,
    quantity: int,
    notional: Decimal,
) -> None:
    conn.execute(
        """
        INSERT INTO stock_candles
               (listing_id, interval, bucket_start, open, high, low, close,
                volume, quote_volume, trades)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
        ON CONFLICT (listing_id, interval, bucket_start) DO UPDATE
           SET high = GREATEST(stock_candles.high, EXCLUDED.high),
               low = LEAST(stock_candles.low, EXCLUDED.low),
               close = EXCLUDED.close,
               volume = stock_candles.volume + EXCLUDED.volume,
               quote_volume = stock_candles.quote_volume + EXCLUDED.quote_volume,
               trades = stock_candles.trades + 1
        """,
        (listing_id, interval, bucket_start, price, price, price, price, quantity, notional),
    )


def candles(conn, listing_id: str, interval: str, limit: int = 300, before=None) -> list[dict]:
    if before is None:
        rows = conn.execute(
            "SELECT bucket_start, open, high, low, close, volume, quote_volume, trades "
            "FROM stock_candles WHERE listing_id = %s AND interval = %s "
            "ORDER BY bucket_start DESC LIMIT %s",
            (listing_id, interval, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT bucket_start, open, high, low, close, volume, quote_volume, trades "
            "FROM stock_candles WHERE listing_id = %s AND interval = %s AND bucket_start < %s "
            "ORDER BY bucket_start DESC LIMIT %s",
            (listing_id, interval, before, limit),
        ).fetchall()
    return list(reversed(rows))


# ------------------------------------------------------------------ holders
HOLDER_COLUMNS = "actor_id, listing_id, shares, locked_shares, locked_until, avg_cost"


def holder(conn, actor_id: str, listing_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {HOLDER_COLUMNS} FROM stock_holders WHERE actor_id = %s AND listing_id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (actor_id, listing_id)).fetchone()


def ensure_holder(conn, actor_id: str, listing_id: str) -> dict:
    row = conn.execute(
        f"""
        INSERT INTO stock_holders (actor_id, listing_id)
        VALUES (%s, %s)
        ON CONFLICT (actor_id, listing_id) DO NOTHING
        RETURNING {HOLDER_COLUMNS}
        """,
        (actor_id, listing_id),
    ).fetchone()
    if row is not None:
        return row
    return conn.execute(
        f"SELECT {HOLDER_COLUMNS} FROM stock_holders WHERE actor_id = %s AND listing_id = %s "
        "FOR UPDATE",
        (actor_id, listing_id),
    ).fetchone()


def credit_shares(
    conn,
    *,
    actor_id: str,
    listing_id: str,
    quantity: int,
    price: Decimal,
    locked_until: datetime | None,
) -> dict:
    """Buy side: raise shares, roll the average cost, optionally lock (T+1)."""
    return conn.execute(
        """
        UPDATE stock_holders
           SET shares = shares + %(qty)s,
               locked_shares = locked_shares + %(lock)s,
               locked_until = CASE WHEN %(lock)s > 0 THEN %(until)s ELSE locked_until END,
               avg_cost = CASE WHEN shares + %(qty)s > 0
                               THEN ((avg_cost * shares) + (%(price)s * %(qty)s))
                                    / (shares + %(qty)s)
                               ELSE %(price)s END,
               updated_at = now()
         WHERE actor_id = %(actor)s AND listing_id = %(listing)s
        RETURNING actor_id, listing_id, shares, locked_shares, locked_until, avg_cost
        """,
        {
            "qty": quantity,
            "lock": quantity if locked_until is not None else 0,
            "until": locked_until,
            "price": price,
            "actor": actor_id,
            "listing": listing_id,
        },
    ).fetchone()


def debit_shares(conn, *, actor_id: str, listing_id: str, quantity: int) -> dict | None:
    """Sell side: shares leave the holder; avg cost stays for the remainder."""
    return conn.execute(
        """
        UPDATE stock_holders
           SET shares = shares - %(qty)s,
               updated_at = now()
         WHERE actor_id = %(actor)s AND listing_id = %(listing)s
           AND shares >= %(qty)s
        RETURNING actor_id, listing_id, shares, locked_shares, avg_cost
        """,
        {"qty": quantity, "actor": actor_id, "listing": listing_id},
    ).fetchone()


def available_shares(conn, actor_id: str, listing_id: str) -> int:
    row = holder(conn, actor_id, listing_id)
    if row is None:
        return 0
    return max(0, int(row["shares"]) - int(row["locked_shares"]))


def holders_of(conn, listing_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT h.actor_id, h.shares, h.locked_shares, h.avg_cost, a.code, a.display_name
          FROM stock_holders h JOIN economic_actors a ON a.id = h.actor_id
         WHERE h.listing_id = %s AND h.shares > 0
         ORDER BY h.shares DESC
        """,
        (listing_id,),
    ).fetchall()


def unlock_due(conn) -> int:
    rows = conn.execute(
        """
        UPDATE stock_holders
           SET locked_shares = 0, locked_until = NULL, updated_at = now()
         WHERE locked_shares > 0 AND locked_until IS NOT NULL AND locked_until <= now()
        RETURNING actor_id
        """
    ).fetchall()
    return len(rows)


# ------------------------------------------------------------------ daily
def upsert_daily(
    conn,
    *,
    listing_id: str,
    trade_date: date,
    open_price: Decimal,
    high: Decimal,
    low: Decimal,
    close: Decimal,
    prev_close: Decimal,
    volume: int,
    quote_volume: Decimal,
    trades: int,
) -> dict:
    change = Decimal(0)
    if prev_close and prev_close > 0:
        change = (close - prev_close) / prev_close
    return conn.execute(
        """
        INSERT INTO stock_daily_summary
               (listing_id, trade_date, open, high, low, close, prev_close, change_pct,
                volume, quote_volume, trades)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (listing_id, trade_date) DO UPDATE
           SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
               close = EXCLUDED.close, prev_close = EXCLUDED.prev_close,
               change_pct = EXCLUDED.change_pct, volume = EXCLUDED.volume,
               quote_volume = EXCLUDED.quote_volume, trades = EXCLUDED.trades
        RETURNING listing_id, trade_date, open, high, low, close, change_pct, volume, trades
        """,
        (
            listing_id,
            trade_date,
            open_price,
            high,
            low,
            close,
            prev_close,
            change,
            volume,
            quote_volume,
            trades,
        ),
    ).fetchone()


def last_daily(conn, listing_id: str, *, before: date | None = None) -> dict | None:
    if before is None:
        return conn.execute(
            "SELECT listing_id, trade_date, close, volume, trades FROM stock_daily_summary "
            "WHERE listing_id = %s ORDER BY trade_date DESC LIMIT 1",
            (listing_id,),
        ).fetchone()
    return conn.execute(
        "SELECT listing_id, trade_date, close, volume, trades FROM stock_daily_summary "
        "WHERE listing_id = %s AND trade_date < %s ORDER BY trade_date DESC LIMIT 1",
        (listing_id, before),
    ).fetchone()


def daily_series(conn, listing_id: str, limit: int = 20) -> list[dict]:
    return conn.execute(
        "SELECT trade_date, close, volume, trades FROM stock_daily_summary "
        "WHERE listing_id = %s ORDER BY trade_date DESC LIMIT %s",
        (listing_id, limit),
    ).fetchall()


# ------------------------------------------------------------------ dividends
def insert_dividend(
    conn,
    *,
    company_id: str,
    listing_id: str | None,
    per_share: Decimal,
    total_paid: Decimal,
    tx_id: str | None,
    record_at: datetime,
    pay_at: datetime,
) -> dict:
    return conn.execute(
        """
        INSERT INTO dividends
               (company_id, listing_id, per_share, total_paid, record_at, pay_at, status, tx_id)
        VALUES (%s, %s, %s, %s, %s, %s, 'paid', %s)
        RETURNING id, company_id, listing_id, per_share, total_paid, status, record_at, pay_at
        """,
        (company_id, listing_id, per_share, total_paid, record_at, pay_at, tx_id),
    ).fetchone()


def dividends_for(conn, *, company_id: str | None = None, listing_id: str | None = None,
                  limit: int = 20) -> list[dict]:
    if listing_id:
        return conn.execute(
            "SELECT id, company_id, listing_id, per_share, total_paid, status, record_at, pay_at "
            "FROM dividends WHERE listing_id = %s ORDER BY pay_at DESC LIMIT %s",
            (listing_id, limit),
        ).fetchall()
    return conn.execute(
        "SELECT id, company_id, listing_id, per_share, total_paid, status, record_at, pay_at "
        "FROM dividends WHERE company_id = %s ORDER BY pay_at DESC LIMIT %s",
        (company_id, limit),
    ).fetchall()


# ------------------------------------------------------------------ margin
def margin_account(conn, actor_id: str, currency_code: str = "cc4", *,
                   for_update: bool = False) -> dict | None:
    sql = ("SELECT actor_id, currency_code, cash, collateral, status, updated_at "
           "FROM margin_accounts WHERE actor_id = %s AND currency_code = %s")
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (actor_id, currency_code)).fetchone()


def ensure_margin_account(conn, actor_id: str, currency_code: str = "cc4") -> dict:
    row = conn.execute(
        """
        INSERT INTO margin_accounts (actor_id, currency_code)
        VALUES (%s, %s)
        ON CONFLICT (actor_id, currency_code) DO NOTHING
        RETURNING actor_id, currency_code, cash, collateral, status, updated_at
        """,
        (actor_id, currency_code),
    ).fetchone()
    if row is not None:
        return row
    return margin_account(conn, actor_id, currency_code, for_update=True)


def adjust_margin_cash(conn, actor_id: str, delta: Decimal, currency_code: str = "cc4") -> dict | None:
    return conn.execute(
        """
        UPDATE margin_accounts
           SET cash = cash + %s, updated_at = now()
         WHERE actor_id = %s AND currency_code = %s AND cash + %s >= 0
        RETURNING actor_id, currency_code, cash, status
        """,
        (delta, actor_id, currency_code, delta),
    ).fetchone()


def set_margin_status(conn, actor_id: str, status: str, currency_code: str = "cc4") -> None:
    conn.execute(
        "UPDATE margin_accounts SET status = %s, updated_at = now() "
        "WHERE actor_id = %s AND currency_code = %s",
        (status, actor_id, currency_code),
    )


# ------------------------------------------------------------------ lending
def insert_lending(conn, *, listing_id: str, lender_actor_id: str, quantity: int,
                   fee_bps: int, due_at=None) -> dict:
    return conn.execute(
        """
        INSERT INTO securities_lending (listing_id, lender_actor_id, quantity, fee_bps, due_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, listing_id, lender_actor_id, quantity, fee_bps, status, due_at
        """,
        (listing_id, lender_actor_id, quantity, fee_bps, due_at),
    ).fetchone()


def open_lending(conn, listing_id: str, *, for_update: bool = False) -> list[dict]:
    sql = (
        "SELECT id, listing_id, lender_actor_id, quantity, fee_bps, status, due_at "
        "FROM securities_lending WHERE listing_id = %s AND status = 'open' "
        "ORDER BY created_at ASC"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (listing_id,)).fetchall()


def lending_quantity(conn, listing_id: str, status: str = "open") -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(quantity), 0) AS qty FROM securities_lending "
        "WHERE listing_id = %s AND status = %s",
        (listing_id, status),
    ).fetchone()
    return int(row["qty"])


def due_lending(conn, lending_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, listing_id, lender_actor_id, quantity, fee_bps, status, due_at "
        "FROM securities_lending WHERE id = %s",
        (lending_id,),
    ).fetchone()


def mark_lending(conn, lending_id: str, *, status: str | None = None,
                 borrower_actor_id: str | None = None, quantity: int | None = None) -> None:
    sets, params = [], []
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    if borrower_actor_id is not None:
        sets.append("borrower_actor_id = %s")
        params.append(borrower_actor_id)
    if quantity is not None:
        sets.append("quantity = %s")
        params.append(quantity)
    if not sets:
        return
    params.append(lending_id)
    conn.execute(
        f"UPDATE securities_lending SET {', '.join(sets)}, updated_at = now() WHERE id = %s",
        params,
    )


# ------------------------------------------------------------------ shorts
def insert_short(
    conn,
    *,
    actor_id: str,
    listing_id: str,
    quantity: int,
    entry_price: Decimal,
    borrowed_from: str | None,
    margin: Decimal,
) -> dict:
    return conn.execute(
        """
        INSERT INTO short_positions (actor_id, listing_id, quantity, entry_price, borrowed_from, margin)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, actor_id, listing_id, quantity, entry_price, borrowed_from, margin,
                  fee_paid, status, opened_at
        """,
        (actor_id, listing_id, quantity, entry_price, borrowed_from, margin),
    ).fetchone()


def open_shorts(conn, *, actor_id: str | None = None, listing_id: str | None = None,
                for_update: bool = False) -> list[dict]:
    clauses, params = ["status IN ('open','forced')"], []
    if actor_id:
        clauses.append("actor_id = %s")
        params.append(actor_id)
    if listing_id:
        clauses.append("listing_id = %s")
        params.append(listing_id)
    sql = (
        "SELECT id, actor_id, listing_id, quantity, entry_price, borrowed_from, margin, "
        "fee_paid, status, opened_at FROM short_positions WHERE "
        + " AND ".join(clauses)
        + " ORDER BY opened_at ASC"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, params).fetchall()


def close_short(conn, short_id: str, *, remaining: int | None, status: str,
                closed_price: Decimal, fee_paid: Decimal) -> None:
    """``remaining=None`` means the position is fully closed; the quantity column
    stays at its original size as the historical record."""
    conn.execute(
        """
        UPDATE short_positions
           SET quantity = COALESCE(%s, quantity),
               status = %s,
               closed_price = %s,
               fee_paid = fee_paid + %s,
               closed_at = CASE WHEN %s = 'closed' THEN now() ELSE closed_at END
         WHERE id = %s
        """,
        (remaining, status, closed_price, fee_paid, status, short_id),
    )


def add_short_fee(conn, short_id: str, fee: Decimal) -> None:
    conn.execute(
        "UPDATE short_positions SET fee_paid = fee_paid + %s WHERE id = %s", (fee, short_id)
    )


def short_quantity(conn, listing_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(quantity), 0) AS qty FROM short_positions "
        "WHERE listing_id = %s AND status IN ('open','forced')",
        (listing_id,),
    ).fetchone()
    return int(row["qty"])


def shorts_of(conn, actor_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT s.id, s.listing_id, l.ticker, s.quantity, s.entry_price, s.margin,
               s.fee_paid, s.status, s.opened_at, l.last_price
          FROM short_positions s JOIN stock_listings l ON l.id = s.listing_id
         WHERE s.actor_id = %s AND s.status IN ('open','forced')
         ORDER BY s.opened_at DESC
        """,
        (actor_id,),
    ).fetchall()


# ------------------------------------------------------------------ delisting
def insert_delisting(conn, *, listing_id: str, reason: str, last_price: Decimal) -> dict:
    return conn.execute(
        """
        INSERT INTO delisting_cases (listing_id, reason, last_price)
        VALUES (%s, %s, %s)
        RETURNING id, listing_id, reason, status, last_price, triggered_at
        """,
        (listing_id, reason, last_price),
    ).fetchone()


def current_delisting(conn, listing_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, listing_id, reason, status, last_price, triggered_at, settled_at "
        "FROM delisting_cases WHERE listing_id = %s AND status IN ('triggered','auction') "
        "ORDER BY triggered_at DESC LIMIT 1",
        (listing_id,),
    ).fetchone()


def settle_delisting(conn, case_id: str, status: str = "settled") -> None:
    conn.execute(
        "UPDATE delisting_cases SET status = %s, settled_at = now() WHERE id = %s",
        (status, case_id),
    )


def jsonb(value: dict) -> str:
    return json.dumps(value, default=str)


def company_controlled_by(conn, treasury_actor_id: str, actor_id: str) -> bool:
    """True when ``actor_id`` holds at least half of the company owning that treasury."""
    row = conn.execute(
        """
        SELECT 1
          FROM companies c
          JOIN share_holdings h ON h.company_id = c.id
         WHERE c.treasury_actor_id = %s AND h.actor_id = %s
           AND h.shares * 2 >= c.shares_total
         LIMIT 1
        """,
        (treasury_actor_id, actor_id),
    ).fetchone()
    return row is not None


def company_shareholder(conn, actor_id: str, company_id: str) -> bool:
    """Pre-IPO holder check used to exempt promoter stock from the float cap."""
    row = conn.execute(
        "SELECT 1 FROM share_holdings WHERE actor_id = %s AND company_id = %s AND shares > 0",
        (actor_id, company_id),
    ).fetchone()
    return row is not None
