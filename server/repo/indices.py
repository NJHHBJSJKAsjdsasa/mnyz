"""Price indices and market-maker quotes persistence."""

from __future__ import annotations

import json
from decimal import Decimal


def indices(conn) -> list[dict]:
    return conn.execute(
        "SELECT code, name, method, currency_code, base_value, base_cap, status, updated_at "
        "FROM price_indices ORDER BY code"
    ).fetchall()


def index(conn, code: str, *, for_update: bool = False) -> dict | None:
    sql = ("SELECT code, name, method, currency_code, base_value, base_cap, status, updated_at "
           "FROM price_indices WHERE code = %s")
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (code,)).fetchone()


def adjust_base_cap(conn, code: str, delta: Decimal) -> None:
    """Divisor adjustment: a new listing enters without moving the index."""
    if delta <= 0:
        return
    conn.execute(
        "UPDATE price_indices SET base_cap = COALESCE(base_cap, 0) + %s, updated_at = now() "
        "WHERE code = %s AND COALESCE(base_cap, 0) > 0",
        (delta, code),
    )


def set_base_cap(conn, code: str, base_cap: Decimal) -> None:
    conn.execute(
        "UPDATE price_indices SET base_cap = %s, updated_at = now() WHERE code = %s",
        (base_cap, code),
    )


def upsert_point(conn, *, code: str, ts, value: Decimal, change_pct: Decimal,
                 sample_size: int, components: list[dict]) -> dict:
    return conn.execute(
        """
        INSERT INTO price_index_points (index_code, ts, value, change_pct, sample_size, components)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (index_code, ts) DO UPDATE
           SET value = EXCLUDED.value, change_pct = EXCLUDED.change_pct,
               sample_size = EXCLUDED.sample_size, components = EXCLUDED.components
        RETURNING id, index_code, ts, value, change_pct, sample_size, components
        """,
        (code, ts, value, change_pct, sample_size, json.dumps(components, default=str)),
    ).fetchone()


def points(conn, code: str, limit: int = 120) -> list[dict]:
    rows = conn.execute(
        "SELECT ts, value, change_pct, sample_size FROM price_index_points "
        "WHERE index_code = %s ORDER BY ts DESC LIMIT %s",
        (code, limit),
    ).fetchall()
    return list(reversed(rows))


def latest_point(conn, code: str) -> dict | None:
    return conn.execute(
        "SELECT ts, value, change_pct, sample_size FROM price_index_points "
        "WHERE index_code = %s ORDER BY ts DESC LIMIT 1",
        (code,),
    ).fetchone()


def insert_quote(conn, *, listing_id: str, actor_id: str | None, mid: Decimal, bid: Decimal,
                 ask: Decimal, spread_bps: int, volatility_bps: int,
                 inventory_skew_bps: int) -> dict:
    return conn.execute(
        """
        INSERT INTO mm_quotes (listing_id, actor_id, mid, bid, ask, spread_bps,
                               volatility_bps, inventory_skew_bps)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, mid, bid, ask, spread_bps, created_at
        """,
        (listing_id, actor_id, mid, bid, ask, spread_bps, volatility_bps, inventory_skew_bps),
    ).fetchone()


def quotes(conn, listing_id: str, limit: int = 20) -> list[dict]:
    return conn.execute(
        "SELECT id, mid, bid, ask, spread_bps, volatility_bps, inventory_skew_bps, created_at "
        "FROM mm_quotes WHERE listing_id = %s ORDER BY created_at DESC LIMIT %s",
        (listing_id, limit),
    ).fetchall()


# ------------------------------------------------------------------ mm programs
def upsert_program(conn, *, actor_id: str, listing_id: str, quantity: int) -> dict:
    return conn.execute(
        """
        INSERT INTO mm_programs (actor_id, listing_id, quantity)
        VALUES (%s, %s, %s)
        ON CONFLICT (actor_id, listing_id) DO UPDATE
           SET quantity = EXCLUDED.quantity, status = 'active', last_error = ''
        RETURNING id, actor_id, listing_id, quantity, status, last_run_at
        """,
        (actor_id, listing_id, quantity),
    ).fetchone()


def program(conn, *, actor_id: str, listing_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, actor_id, listing_id, quantity, status, last_run_at, last_error "
        "FROM mm_programs WHERE actor_id = %s AND listing_id = %s",
        (actor_id, listing_id),
    ).fetchone()


def set_program_status(conn, program_id: str, status: str) -> None:
    conn.execute("UPDATE mm_programs SET status = %s WHERE id = %s", (status, program_id))


def active_programs(conn, limit: int = 100) -> list[dict]:
    return conn.execute(
        "SELECT p.id, p.actor_id, p.listing_id, p.quantity, l.ticker, l.exchange_id "
        "  FROM mm_programs p JOIN stock_listings l ON l.id = p.listing_id "
        " WHERE p.status = 'active' AND l.status = 'listed' "
        "   AND (p.last_run_at IS NULL OR p.last_run_at < now() - interval '60 seconds') "
        " ORDER BY p.last_run_at NULLS FIRST LIMIT %s",
        (limit,),
    ).fetchall()


def touch_program(conn, program_id: str, *, error: str = "") -> None:
    conn.execute(
        "UPDATE mm_programs SET last_run_at = now(), last_error = %s WHERE id = %s",
        (error[:200], program_id),
    )


def programs_of_actor(conn, actor_id: str) -> list[dict]:
    return conn.execute(
        "SELECT p.id, p.quantity, p.status, p.last_run_at, p.last_error, l.ticker "
        "  FROM mm_programs p JOIN stock_listings l ON l.id = p.listing_id "
        " WHERE p.actor_id = %s ORDER BY l.ticker",
        (actor_id,),
    ).fetchall()


def exchange_fee_bps(conn, exchange_id: str) -> int | None:
    row = conn.execute("SELECT fee_bps FROM exchanges WHERE id = %s", (exchange_id,)).fetchone()
    return int(row["fee_bps"]) if row else None
