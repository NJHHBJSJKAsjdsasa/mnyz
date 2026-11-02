"""30-day traded notional per (sector, actor) — the input to anti-trust §6.3.

A "sector" here is one listed ticker: the only market with a real order book in
this build. Both sides of a trade count, so a player who buys and sells the same
volume twice is reported at 2× — that is intended, concentration is about flow,
not about net position.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal


def insert_share_snapshot(
    conn, *, actor_id: str, sector_key: str, period: date, share: Decimal, hhi: Decimal
) -> None:
    """Upsert one actor's row. Same key as ``repo.companies.insert_share_snapshot``."""
    conn.execute(
        """
        INSERT INTO market_share_snapshots (actor_id, sector_key, period, share, hhi)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (actor_id, sector_key, period) DO UPDATE
           SET share = EXCLUDED.share, hhi = EXCLUDED.hhi
        """,
        (actor_id, sector_key, period, share, hhi),
    )


def flows(conn, days: int = 30) -> list[dict]:
    """``(sector_key, actor_id, amount, total)`` for the trailing window."""
    return conn.execute(
        """
        WITH flow AS (
          SELECT l.ticker AS sector_key, t.buyer_actor_id AS actor_id,
                 t.price * t.quantity AS notional
            FROM stock_trades t
            JOIN stock_listings l ON l.id = t.listing_id
           WHERE t.executed_at >= now() - make_interval(days => %s)
          UNION ALL
          SELECT l.ticker, t.seller_actor_id, t.price * t.quantity
            FROM stock_trades t
            JOIN stock_listings l ON l.id = t.listing_id
           WHERE t.executed_at >= now() - make_interval(days => %s)
        ), per_actor AS (
          SELECT sector_key, actor_id, sum(notional) AS amount
            FROM flow
           GROUP BY sector_key, actor_id
        ), totals AS (
          SELECT sector_key, sum(amount) AS total FROM per_actor GROUP BY sector_key
        )
        SELECT p.sector_key, p.actor_id, p.amount, t.total
          FROM per_actor p
          JOIN totals t ON t.sector_key = p.sector_key
         ORDER BY p.sector_key, p.amount DESC
        """,
        (days, days),
    ).fetchall()


def snapshot_for(conn, period: date) -> list[dict]:
    return conn.execute(
        """
        SELECT sector_key, actor_id, share, hhi
          FROM market_share_snapshots
         WHERE period = %s
         ORDER BY sector_key, share DESC
        """,
        (period,),
    ).fetchall()


def latest_period(conn) -> date | None:
    row = conn.execute("SELECT max(period) AS period FROM market_share_snapshots").fetchone()
    return row["period"] if row and row["period"] else None
