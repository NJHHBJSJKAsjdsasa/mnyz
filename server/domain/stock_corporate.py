"""Share splits (with price adjustment), adjustment factors, and candle archiving.

A split rewrites every price and share count in one transaction: listing price,
holders' shares and average cost, historical candles, and any resting orders
(which are cancelled rather than repriced — documented, and safer than guessing
what a client meant).

A reverse split can leave a holder with a fraction of a share. Fractions are not
tradable, so they are rounded down and cashed out at the post-split price, paid
by the company treasury; the amount is recorded on ``stock_splits`` (05 §7).

The archive table is monthly partitioned: ``ensure_archive_partitions`` keeps a
few months of headroom, and ``detach_cold`` detaches partitions past the
retention window into standalone cold tables (07 §4).
"""

from __future__ import annotations

import re
from decimal import Decimal

from ..infra.serialize import ts
from ..infra.errors import (
    Forbidden,
    InsufficientFunds,
    InvalidArgument,
    NotFound,
    Unprocessable,
)
from ..repo import companies as company_repo
from ..repo import currency as currency_repo
from ..repo import stocks as stock_repo
from . import currency_service, events
from .currency_service import Move, q4

MIN_RATIO = Decimal("0.01")
MAX_RATIO = Decimal("100")
DEFAULT_RETENTION_DAYS = 30
ARCHIVE_INTERVALS = ("1m", "5m")
DEFAULT_KEEP_MONTHS = 24


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

    post_price = q4(Decimal(listing["last_price"]) / value)
    post_prev = q4(Decimal(listing["prev_close"]) / value)
    cancelled = conn.execute(
        "UPDATE stock_orders SET status = 'cancelled' "
        " WHERE listing_id = %s AND status = 'open' RETURNING id",
        (str(listing["id"]),),
    ).fetchall()

    # Every holder is rounded down individually, so the fraction each one loses
    # is visible instead of being buried in a bulk UPDATE (05 §7).
    holders = conn.execute(
        "SELECT actor_id, shares, avg_cost FROM stock_holders "
        " WHERE listing_id = %s AND shares > 0 FOR UPDATE",
        (str(listing["id"]),),
    ).fetchall()
    treasury_actor = str(company["treasury_actor_id"])
    payouts: list[tuple[str, Decimal]] = []
    rounded = 0
    for holder in holders:
        exact = Decimal(int(holder["shares"])) * value
        whole = int(exact)                      # floor, also for par splits
        fraction = exact - Decimal(whole)
        if fraction <= 0:
            continue
        rounded += 1
        cash = q4(fraction * post_price)
        if cash <= 0 or str(holder["actor_id"]) == treasury_actor:
            continue                            # paying itself is a no-op
        payouts.append((str(holder["actor_id"]), cash))

    cash_total = sum((amount for _, amount in payouts), Decimal(0))
    if cash_total > 0:
        account = currency_repo.account(conn, treasury_actor, listing["currency_code"])
        treasury_balance = Decimal(account["balance"]) if account else Decimal(0)
        if treasury_balance < cash_total:
            raise InsufficientFunds(
                f"公司金库不足以支付碎股折现：需要 {cash_total} {listing['currency_code']}，"
                f"可用 {treasury_balance}"
            )

    conn.execute(
        "UPDATE stock_listings SET total_shares = GREATEST(1, FLOOR(total_shares * %s)), "
        "free_float = FLOOR(free_float * %s), last_price = %s, prev_close = %s "
        " WHERE id = %s",
        (value, value, post_price, post_prev, str(listing["id"])),
    )
    # shares scale by the ratio, the per-share cost basis scales by its inverse
    conn.execute(
        "UPDATE stock_holders SET shares = FLOOR(shares * %s), "
        "avg_cost = CASE WHEN avg_cost IS NULL THEN NULL ELSE ROUND(avg_cost / %s, 4) END "
        " WHERE listing_id = %s",
        (value, value, str(listing["id"])),
    )
    for table in ("stock_candles", "stock_candle_archive"):
        conn.execute(
            f"UPDATE {table} SET open = ROUND(open / %s, 4), high = ROUND(high / %s, 4), "
            "low = ROUND(low / %s, 4), close = ROUND(close / %s, 4), "
            "volume = FLOOR(volume * %s) "
            " WHERE listing_id = %s",
            (value, value, value, value, value, str(listing["id"])),
        )

    for holder_actor, cash in payouts:
        currency_service.post(
            conn,
            kind="split_cash_in_lieu",
            moves=[Move(treasury_actor, listing["currency_code"], -cash),
                   Move(holder_actor, listing["currency_code"], cash)],
            ref_type="stock_listing",
            ref_id=str(listing["id"]),
            memo=f"{listing['ticker']} 碎股折现 1:{value}",
        )
    conn.execute(
        "INSERT INTO stock_splits (listing_id, ratio, executed_by, cash_in_lieu, "
        "holders_rounded) VALUES (%s, %s, %s, %s, %s)",
        (str(listing["id"]), value, str(actor["id"]), cash_total, rounded),
    )
    events.publish(
        conn,
        type=events.STOCK_SPLIT,
        aggregate=listing["ticker"],
        payload={
            "ticker": listing["ticker"],
            "ratio": str(value),
            "post_price": str(post_price),
            "cancelled_orders": len(cancelled),
            "cash_in_lieu": str(q4(cash_total)),
        },
        actor_id=str(actor["id"]),
    )
    return {
        "ticker": listing["ticker"],
        "ratio": str(value),
        "last_price": str(post_price),
        "prev_close": str(post_prev),
        "cancelled_orders": len(cancelled),
        "cash_in_lieu": str(q4(cash_total)),
        "holders_rounded": rounded,
        "adjusts": ["listing", "holders", "candles"],
    }


# ------------------------------------------------------------------ factors
def adjustment_factors(conn, ticker: str) -> dict:
    """Cumulative split factors, newest first (05 §7 复权).

    ``factor`` is the product of that split's ratio and every later one, so the
    earliest split carries the largest factor. Stored
    candles are already rewritten at split time, so this endpoint exists for
    clients holding raw snapshots: divide a pre-split price by ``factor`` and
    multiply its volume by ``factor`` to reach today's share count.
    """
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    rows = conn.execute(
        "SELECT id, ratio, cash_in_lieu, created_at FROM stock_splits "
        " WHERE listing_id = %s ORDER BY created_at",
        (str(listing["id"]),),
    ).fetchall()
    factors: list[dict] = []
    cumulative = Decimal(1)
    for row in reversed(rows):
        cumulative *= Decimal(row["ratio"])
        factors.append({
            "split_id": str(row["id"]),
            "ratio": str(Decimal(row["ratio"])),
            "factor": str(q4(cumulative)),
            "executed_at": ts(row["created_at"]),
        })
    factors.reverse()
    return {
        "ticker": listing["ticker"],
        "last_price": str(Decimal(listing["last_price"])),
        "cumulative_factor": str(q4(cumulative)),
        "splits": factors,
    }


# ------------------------------------------------------------------ archive
def archive_candles(conn, *, days: int = DEFAULT_RETENTION_DAYS,
                    limit: int = 5000) -> dict:
    """Move intraday buckets older than ``days`` into the archive table."""
    if days <= 0:
        raise Unprocessable("保留天数必须大于 0")
    ensure_archive_partitions(conn)
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


def _month_bounds(conn, offset: int) -> dict:
    """Partition bounds as the database sees them.

    The session time zone decides where a month starts, so boundaries are asked
    for here rather than computed in Python: mixing the two produced partitions
    that overlapped by the local UTC offset.
    """
    return conn.execute(
        """
        WITH months AS (
          SELECT date_trunc('month', now() AT TIME ZONE 'UTC')
                 + make_interval(months => %s) AS local_month
        )
        SELECT local_month AT TIME ZONE 'UTC' AS start_at,
               (local_month + interval '1 month') AT TIME ZONE 'UTC' AS end_at,
               to_char(local_month, 'YYYYMM') AS label
          FROM months
        """,
        (offset,),
    ).fetchone()


def ensure_archive_partitions(conn, *, months_ahead: int = 3,
                              months_back: int = 24) -> dict:
    """Create the monthly partitions the archive is expected to need (07 §4)."""
    if months_ahead < 0 or months_back < 0:
        raise Unprocessable("分区预建参数不能为负")
    created: list[str] = []
    for offset in range(-months_back, months_ahead + 1):
        bounds = _month_bounds(conn, offset)
        name = f"stock_candle_archive_{bounds['label']}"
        # match on the range, not the name: a month that was detached as cold is
        # still accounted for and must not be recreated as a second hot partition
        exists = conn.execute(
            "SELECT 1 FROM candle_archive_partitions WHERE range_start = %s",
            (bounds["start_at"],),
        ).fetchone()
        if exists:
            continue
        # DDL cannot take bind parameters, so the literals are formatted here
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {name} PARTITION OF stock_candle_archive "
            # DDL partition bounds: must stay a bare timestamp so ATTACH matches
            # the existing hot partitions exactly.
            f"FOR VALUES FROM ('{bounds['start_at'].isoformat()}') "
            f"TO ('{bounds['end_at'].isoformat()}')"
        )
        conn.execute(
            "INSERT INTO candle_archive_partitions (partition_name, range_start, range_end) "
            "VALUES (%s, %s, %s) ON CONFLICT (partition_name) DO NOTHING",
            (name, bounds["start_at"], bounds["end_at"]),
        )
        created.append(name)
    return {"checked": months_ahead + months_back + 1, "created": created}


def detach_cold(conn, *, keep_months: int = DEFAULT_KEEP_MONTHS) -> dict:
    """Detach partitions older than the retention window as cold tables."""
    if keep_months < 1:
        raise Unprocessable("冷备保留月数至少为 1")
    cutoff = conn.execute(
        "SELECT (date_trunc('month', now() AT TIME ZONE 'UTC') "
        "         - make_interval(months => %s)) AT TIME ZONE 'UTC' AS cutoff",
        (keep_months,),
    ).fetchone()["cutoff"]
    rows = conn.execute(
        "SELECT partition_name, range_end FROM candle_archive_partitions "
        " WHERE state = 'hot' AND range_end <= %s ORDER BY range_start",
        (cutoff,),
    ).fetchall()
    detached: list[dict] = []
    for row in rows:
        name = str(row["partition_name"])
        cold_name = name.replace("stock_candle_archive_", "stock_candle_cold_")
        counted = conn.execute(f"SELECT COUNT(*) AS n FROM {name}").fetchone()["n"]
        conn.execute(f"ALTER TABLE stock_candle_archive DETACH PARTITION {name}")
        conn.execute(f"ALTER TABLE {name} RENAME TO {cold_name}")
        conn.execute(
            "UPDATE candle_archive_partitions SET partition_name = %s, state = 'cold', "
            "row_count = %s, detached_at = now() WHERE partition_name = %s",
            (cold_name, int(counted), name),
        )
        detached.append({"partition": cold_name, "rows": int(counted),
                         "range_end": ts(row["range_end"])})
    return {"cutoff": ts(cutoff), "detached": detached,
            "keep_months": keep_months}


COLD_NAME_RE = re.compile(r"^stock_candle_cold_\d{6}$")


def restore_cold(conn, *, partition: str) -> dict:
    """Attach a detached cold table back into the archive (灾难恢复的最小步骤)."""
    name = (partition or "").strip()
    if not COLD_NAME_RE.match(name):
        raise InvalidArgument("冷备分区名需形如 stock_candle_cold_YYYYMM")
    row = conn.execute(
        "SELECT partition_name, range_start, range_end, row_count "
        "  FROM candle_archive_partitions WHERE partition_name = %s AND state = 'cold'",
        (name,),
    ).fetchone()
    if row is None:
        raise NotFound("没有该冷备分区")
    hot_name = name.replace("stock_candle_cold_", "stock_candle_archive_")
    # Same reason as above — this value ends up inside ATTACH ... FOR VALUES.
    start = row["range_start"].isoformat()
    end = row["range_end"].isoformat()
    squatting = conn.execute(
        "SELECT 1 FROM candle_archive_partitions WHERE partition_name = %s AND state = 'hot'",
        (hot_name,),
    ).fetchone()
    if squatting is not None:
        rows_in = conn.execute(f"SELECT COUNT(*) AS n FROM {hot_name}").fetchone()["n"]
        if int(rows_in) > 0:
            raise Unprocessable("该月份已有非空的热分区，无法用冷备覆盖")
        conn.execute(f"ALTER TABLE stock_candle_archive DETACH PARTITION {hot_name}")
        conn.execute(f"DROP TABLE {hot_name}")
        conn.execute(
            "DELETE FROM candle_archive_partitions WHERE partition_name = %s", (hot_name,)
        )
    conn.execute(f"ALTER TABLE {name} RENAME TO {hot_name}")
    conn.execute(
        f"ALTER TABLE stock_candle_archive ATTACH PARTITION {hot_name} "
        f"FOR VALUES FROM ('{start}') TO ('{end}')"
    )
    conn.execute(
        "UPDATE candle_archive_partitions SET partition_name = %s, state = 'hot', "
        "detached_at = NULL WHERE partition_name = %s",
        (hot_name, name),
    )
    return {"partition": hot_name, "state": "hot", "row_count": int(row["row_count"])}


def archive_status(conn) -> dict:
    rows = conn.execute(
        "SELECT partition_name, range_start, range_end, state, row_count, detached_at "
        "  FROM candle_archive_partitions ORDER BY range_start"
    ).fetchall()
    return {
        "partitions": [
            {
                "partition": row["partition_name"],
                "range_start": ts(row["range_start"]),
                "range_end": ts(row["range_end"]),
                "state": row["state"],
                "row_count": int(row["row_count"]),
                "detached_at": ts(row["detached_at"]),
            }
            for row in rows
        ],
        "hot": sum(1 for row in rows if row["state"] == "hot"),
        "cold": sum(1 for row in rows if row["state"] == "cold"),
    }


__all__ = [
    "split", "adjustment_factors", "archive_candles",
    "ensure_archive_partitions", "detach_cold", "restore_cold", "archive_status",
    "DEFAULT_RETENTION_DAYS", "DEFAULT_KEEP_MONTHS",
]
