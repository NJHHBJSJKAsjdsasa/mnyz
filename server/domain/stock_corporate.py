"""Share splits (with price adjustment) and candle archiving (05 §7, 07 §4).

A split rewrites every price and share count in one transaction: listing price,
holders' shares and average cost, historical candles, and any resting orders
(which are cancelled rather than repriced — documented, and safer than guessing
what a client meant).
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import Forbidden, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import stocks as stock_repo
from .currency_service import q4

MIN_RATIO = Decimal("0.01")
MAX_RATIO = Decimal("100")
DEFAULT_RETENTION_DAYS = 30
ARCHIVE_INTERVALS = ("1m", "5m")


def split(conn, *, actor: dict, ticker: str, ratio: Decimal) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper(), for_update=True)
    if listing is None:
        raise NotFound("该股票未上市")
    value = Decimal(str(ratio))
    if not MIN_RATIO <= value <= MAX_RATIO:
        raise Unprocessable(f"拆股比例必须在 {MIN_RATIO}-{MAX_RATIO} 之间")
    if value == 1:
        raise Unprocessable("比例不能为 1")
    company = company_repo.by_id(conn, str(listing["company_id"]))
    if company is None:
        raise NotFound("公司不存在")
    if not stock_repo.company_controlled_by(
        conn, str(company["treasury_actor_id"]), str(actor["id"])
    ):
        raise Forbidden("只有公司控股方可以拆股")

    cancelled = conn.execute(
        "UPDATE stock_orders SET status = 'cancelled' "
        " WHERE listing_id = %s AND status = 'open' RETURNING id",
        (str(listing["id"]),),
    ).fetchall()

    conn.execute(
        "UPDATE stock_listings SET total_shares = FLOOR(total_shares * %s), "
        "free_float = FLOOR(free_float * %s), last_price = %s, prev_close = %s "
        " WHERE id = %s",
        (value, value, q4(Decimal(listing["last_price"]) / value),
         q4(Decimal(listing["prev_close"]) / value), str(listing["id"])),
    )
    # shares scale up, the per-share cost basis scales down by the same ratio
    conn.execute(
        "UPDATE stock_holders SET shares = FLOOR(shares * %s), "
        "avg_cost = CASE WHEN avg_cost IS NULL THEN NULL ELSE ROUND(avg_cost / %s, 4) END "
        " WHERE listing_id = %s",
        (value, value, str(listing["id"])),
    )
    conn.execute(
        "UPDATE stock_candles SET open = ROUND(open / %s, 4), high = ROUND(high / %s, 4), "
        "low = ROUND(low / %s, 4), close = ROUND(close / %s, 4), "
        "volume = FLOOR(volume * %s) "
        " WHERE listing_id = %s",
        (value, value, value, value, value, str(listing["id"])),
    )
    conn.execute(
        "INSERT INTO stock_splits (listing_id, ratio, executed_by) VALUES (%s, %s, %s)",
        (str(listing["id"]), value, str(actor["id"])),
    )
    return {
        "ticker": listing["ticker"],
        "ratio": str(value),
        "last_price": str(q4(Decimal(listing["last_price"]) / value)),
        "prev_close": str(q4(Decimal(listing["prev_close"]) / value)),
        "cancelled_orders": len(cancelled),
        "adjusts": ["listing", "holders", "candles"],
    }


def archive_candles(conn, *, days: int = DEFAULT_RETENTION_DAYS,
                    limit: int = 5000) -> dict:
    """Move intraday buckets older than ``days`` into the archive table."""
    if days <= 0:
        raise Unprocessable("保留天数必须大于 0")
    moved = conn.execute(
        """
        WITH old AS (
          SELECT listing_id, interval, bucket_start
            FROM stock_candles
           WHERE interval = ANY(%s) AND bucket_start < now() - (%s || ' days')::interval
           ORDER BY bucket_start
           LIMIT %s
        ), archived AS (
          INSERT INTO stock_candle_archive
                 (listing_id, interval, bucket_start, open, high, low, close,
                  volume, quote_volume, trades)
          SELECT c.listing_id, c.interval, c.bucket_start, c.open, c.high, c.low,
                 c.close, c.volume, c.quote_volume, c.trades
            FROM stock_candles c
            JOIN old o USING (listing_id, interval, bucket_start)
          ON CONFLICT (listing_id, interval, bucket_start) DO NOTHING
          RETURNING 1
        ), deleted AS (
          DELETE FROM stock_candles c
           USING old o
           WHERE c.listing_id = o.listing_id AND c.interval = o.interval
             AND c.bucket_start = o.bucket_start
          RETURNING 1
        )
        SELECT (SELECT COUNT(*) FROM archived) AS archived,
               (SELECT COUNT(*) FROM deleted) AS deleted
        """,
        (list(ARCHIVE_INTERVALS), int(days), int(limit)),
    ).fetchone()
    return {
        "archived": int(moved["archived"]),
        "deleted": int(moved["deleted"]),
        "retention_days": int(days),
    }


__all__ = ["split", "archive_candles", "DEFAULT_RETENTION_DAYS"]
