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
