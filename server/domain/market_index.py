"""Price index and market-maker quoting (03 §4, 06 §6.1).

The index is cap-weighted over live listings and rebased on its first computation,
so a fresh universe starts at exactly ``base_value`` (1000). Quotes are pure
arithmetic over the book, the recent range and the maker's inventory — no
privileged data, no clock, and the same formula a human market maker can read.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from ..infra.errors import NotFound
from ..repo import indices as index_repo
from ..repo import stocks as stock_repo
from .currency_service import q4

DEFAULT_INDEX = "CSX"
MIN_SPREAD_BPS = 20            # 0.20 %
VOL_SPREAD_FACTOR = Decimal("0.5")
MAX_SPREAD_BPS = 500
MIN_QUOTE = Decimal("0.0001")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _minute(ts: datetime) -> datetime:
    return ts.replace(second=0, microsecond=0)


def compute(conn, code: str = DEFAULT_INDEX) -> dict:
    row = index_repo.index(conn, code, for_update=True)
    if row is None:
        raise NotFound("指数不存在")
    listings = [
        item for item in stock_repo.list_listings(conn, status="listed")
        if Decimal(item["last_price"] or 0) > 0
    ]
    total_cap = Decimal(0)
    weights: list[tuple[Decimal, dict]] = []
    for listing in listings:
        price = Decimal(listing["last_price"])
        cap = q4(price * Decimal(int(listing["free_float"])))
        total_cap += cap
        weights.append((cap, listing))

    base_value = Decimal(row["base_value"])
    if total_cap <= 0:
        return {
            "code": code,
            "value": str(base_value),
            "change_pct": "0",
            "sample_size": 0,
            "components": [],
            "base_cap": str(Decimal(row["base_cap"] or 0)),
        }
    base_cap = Decimal(row["base_cap"] or 0)
    if base_cap <= 0:
        index_repo.set_base_cap(conn, code, total_cap)
        base_cap = total_cap
    value = q4(base_value * total_cap / base_cap)

    components = sorted(
        (
            {
                "ticker": listing["ticker"],
                "weight": str(q4(cap / total_cap)),
                "price": str(Decimal(listing["last_price"])),
            }
            for cap, listing in weights
        ),
        key=lambda item: Decimal(item["weight"]),
        reverse=True,
    )[:5]

    previous = index_repo.latest_point(conn, code)
    change_pct = Decimal(0)
    if previous is not None:
        prev_value = Decimal(previous["value"])
        if prev_value > 0:
            change_pct = q4((value - prev_value) / prev_value * 100)
    return {
        "code": code,
        "name": row["name"],
        "value": str(value),
        "change_pct": str(change_pct),
        "sample_size": len(listings),
        "base_cap": str(base_cap),
        "total_cap": str(total_cap),
        "components": components,
    }


def publish(conn, code: str = DEFAULT_INDEX, *, at: datetime | None = None) -> dict:
    snapshot = compute(conn, code)
    ts = _minute(at or _now())
    point = index_repo.upsert_point(
        conn,
        code=code,
        ts=ts,
        value=Decimal(snapshot["value"]),
        change_pct=Decimal(snapshot["change_pct"]),
        sample_size=int(snapshot["sample_size"]),
        components=snapshot["components"],
    )
    return {
        "code": code,
        "ts": point["ts"].isoformat(),
        "value": str(Decimal(point["value"])),
        "change_pct": str(Decimal(point["change_pct"])),
        "sample_size": int(point["sample_size"]),
    }


def overview(conn) -> list[dict]:
    result = []
    for row in index_repo.indices(conn):
        if row["status"] != "active":
            continue
        snapshot = compute(conn, row["code"])
        result.append({
            "code": row["code"],
            "name": row["name"],
            "value": snapshot["value"],
            "change_pct": snapshot["change_pct"],
            "sample_size": snapshot["sample_size"],
            "components": snapshot["components"],
        })
    return result


def series(conn, code: str, limit: int = 120) -> dict:
    row = index_repo.index(conn, code)
    if row is None:
        raise NotFound("指数不存在")
    limit = max(1, min(int(limit), 500))
    return {
        "code": code,
        "name": row["name"],
        "points": [
            {
                "t": item["ts"].isoformat(),
                "v": str(Decimal(item["value"])),
                "pct": str(Decimal(item["change_pct"])),
            }
            for item in index_repo.points(conn, code, limit)
        ],
    }


# ------------------------------------------------------------------ market maker
def _volatility_bps(conn, listing: dict) -> int:
    candles = stock_repo.candles(conn, str(listing["id"]), "1d", 21)
    closes = [Decimal(row["close"]) for row in candles]
    if len(closes) < 3:
        last = Decimal(listing["last_price"] or 0)
        prev = Decimal(listing["prev_close"] or 0) or last
        if last <= 0 or prev <= 0:
            return MIN_SPREAD_BPS
        return int(abs((last - prev) / prev) * 10_000)
    returns = [
        abs((closes[i] - closes[i - 1]) / closes[i - 1])
        for i in range(1, len(closes))
        if closes[i - 1] > 0
    ]
    if not returns:
        return MIN_SPREAD_BPS
    mean = sum(returns) / Decimal(len(returns))
    return int(mean * 10_000)


def quote(conn, ticker: str, *, actor_id: str | None = None, target_pct: Decimal = Decimal("0.02")):
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    last = Decimal(listing["last_price"] or 0)
    bids = stock_repo.book_bids(conn, str(listing["id"]), limit=1)
    asks = stock_repo.book_asks(conn, str(listing["id"]), limit=1)
    if last <= 0:
        raise NotFound("该股票尚未成交，无法报价")
    mid = last
    if bids and asks:
        mid = q4((Decimal(bids[0]["price"]) + Decimal(asks[0]["price"])) / 2)

    volatility = _volatility_bps(conn, listing)
    spread_bps = max(MIN_SPREAD_BPS, int(volatility * VOL_SPREAD_FACTOR))
    spread_bps = min(spread_bps, MAX_SPREAD_BPS)

    skew_bps = 0
    inventory = 0
    if actor_id:
        held = stock_repo.holder(conn, actor_id, str(listing["id"]))
        inventory = int(held["shares"]) if held else 0
        target = max(1, int(Decimal(int(listing["free_float"])) * target_pct))
        deviation = Decimal(inventory - target) / Decimal(target)
        skew_bps = int(max(Decimal(-100), min(Decimal(100), deviation * 100)))

    half = Decimal(spread_bps) / Decimal(20_000)          # half spread as a ratio
    skew = Decimal(skew_bps) / Decimal(10_000)
    # inventory skew shifts the whole band instead of breaking bid < mid < ask
    quoted_mid = q4(mid * (1 - skew))
    bid = max(MIN_QUOTE, q4(quoted_mid * (1 - half)))
    ask = max(MIN_QUOTE, q4(quoted_mid * (1 + half)))
    # never cross the resting book: a maker that quotes through it just self-fills
    tick = Decimal("0.0001")
    if asks:
        best_ask = Decimal(asks[0]["price"])
        if bid >= best_ask:
            bid = max(MIN_QUOTE, q4(best_ask - tick))
    if bids:
        best_bid = Decimal(bids[0]["price"])
        if ask <= best_bid:
            ask = q4(best_bid + tick)
    if ask <= bid:
        ask = q4(bid + MIN_QUOTE)

    return {
        "ticker": listing["ticker"],
        "mid": str(mid),
        "quoted_mid": str(quoted_mid),
        "bid": str(bid),
        "ask": str(ask),
        "spread_bps": spread_bps,
        "volatility_bps": volatility,
        "inventory": inventory,
        "inventory_skew_bps": skew_bps,
        "currency_code": listing["currency_code"],
        "settlement_mode": listing["settlement_mode"],
    }


def publish_quote(conn, *, ticker: str, actor_id: str) -> dict:
    payload = quote(conn, ticker, actor_id=actor_id)
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    index_repo.insert_quote(
        conn,
        listing_id=str(listing["id"]),
        actor_id=actor_id,
        mid=Decimal(payload["mid"]),
        bid=Decimal(payload["bid"]),
        ask=Decimal(payload["ask"]),
        spread_bps=int(payload["spread_bps"]),
        volatility_bps=int(payload["volatility_bps"]),
        inventory_skew_bps=int(payload["inventory_skew_bps"]),
    )
    return payload


def tick(conn) -> dict:
    """Job body: publish the minute snapshot for every active index."""
    published = []
    for row in index_repo.indices(conn):
        if row["status"] != "active":
            continue
        published.append(publish(conn, row["code"]))
    return {"published": len(published), "points": published}


__all__ = ["compute", "publish", "overview", "series", "quote", "publish_quote", "tick"]
