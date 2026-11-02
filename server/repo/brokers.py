"""Brokerage persistence: memberships, client accounts, commissions and venues (05 §9)."""

from __future__ import annotations

import json
from decimal import Decimal

MEMBERSHIP_COLUMNS = (
    "id, firm_actor_id, exchange_id, status, commission_bps, admitted_by, created_at"
)
ACCOUNT_COLUMNS = (
    "id, client_actor_id, broker_actor_id, commission_bps, status, created_at, closed_at"
)


# ------------------------------------------------------------------ membership
def membership(conn, firm_actor_id: str, exchange_id: str) -> dict | None:
    return conn.execute(
        f"SELECT {MEMBERSHIP_COLUMNS} FROM broker_memberships "
        "WHERE firm_actor_id = %s AND exchange_id = %s",
        (firm_actor_id, exchange_id),
    ).fetchone()


def membership_by_id(conn, membership_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {MEMBERSHIP_COLUMNS} FROM broker_memberships WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (membership_id,)).fetchone()


def upsert_membership(conn, *, firm_actor_id: str, exchange_id: str, commission_bps: int,
                      admitted_by: str) -> dict:
    return conn.execute(
        f"""
        INSERT INTO broker_memberships (firm_actor_id, exchange_id, commission_bps, admitted_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (firm_actor_id, exchange_id) DO UPDATE
           SET status = 'active', commission_bps = EXCLUDED.commission_bps,
               admitted_by = EXCLUDED.admitted_by
        RETURNING {MEMBERSHIP_COLUMNS}
        """,
        (firm_actor_id, exchange_id, int(commission_bps), admitted_by),
    ).fetchone()


def set_membership_status(conn, membership_id: str, status: str) -> None:
    conn.execute(
        "UPDATE broker_memberships SET status = %s WHERE id = %s", (status, membership_id)
    )


def memberships_of_exchange(conn, exchange_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT m.id, m.firm_actor_id, m.status, m.commission_bps, a.code, a.display_name
          FROM broker_memberships m
          JOIN economic_actors a ON a.id = m.firm_actor_id
         WHERE m.exchange_id = %s AND m.status = 'active'
         ORDER BY a.code
        """,
        (exchange_id,),
    ).fetchall()


# ------------------------------------------------------------------ accounts
def account_of_client(conn, client_actor_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {ACCOUNT_COLUMNS} FROM broker_accounts WHERE client_actor_id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (client_actor_id,)).fetchone()


def open_account(conn, *, client_actor_id: str, broker_actor_id: str,
                 commission_bps: int) -> dict:
    return conn.execute(
        f"""
        INSERT INTO broker_accounts (client_actor_id, broker_actor_id, commission_bps)
        VALUES (%s, %s, %s)
        ON CONFLICT (client_actor_id) DO UPDATE
           SET broker_actor_id = EXCLUDED.broker_actor_id,
               commission_bps = EXCLUDED.commission_bps,
               status = 'active', closed_at = NULL
        RETURNING {ACCOUNT_COLUMNS}
        """,
        (client_actor_id, broker_actor_id, int(commission_bps)),
    ).fetchone()


def close_account(conn, client_actor_id: str) -> None:
    conn.execute(
        "UPDATE broker_accounts SET status = 'closed', closed_at = now() "
        "WHERE client_actor_id = %s AND status = 'active'",
        (client_actor_id,),
    )


def clients_of_broker(conn, broker_actor_id: str, limit: int = 100) -> list[dict]:
    return conn.execute(
        """
        SELECT b.id, b.client_actor_id, b.commission_bps, b.status, b.created_at,
               a.code, a.display_name
          FROM broker_accounts b
          JOIN economic_actors a ON a.id = b.client_actor_id
         WHERE b.broker_actor_id = %s
         ORDER BY b.created_at DESC LIMIT %s
        """,
        (broker_actor_id, limit),
    ).fetchall()


# ------------------------------------------------------------------ commissions
def insert_commission(conn, *, trade_id: str, broker_actor_id: str, client_actor_id: str,
                      exchange_id: str | None, currency_code: str, notional: Decimal,
                      commission_bps: int, amount: Decimal) -> None:
    conn.execute(
        """
        INSERT INTO broker_commissions
               (trade_id, broker_actor_id, client_actor_id, exchange_id, currency_code,
                notional, commission_bps, amount)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (trade_id, client_actor_id) DO NOTHING
        """,
        (trade_id, broker_actor_id, client_actor_id, exchange_id, currency_code,
         notional, int(commission_bps), amount),
    )


def commissions_of_broker(conn, broker_actor_id: str, limit: int = 50) -> list[dict]:
    return conn.execute(
        """
        SELECT c.id, c.trade_id, c.client_actor_id, c.currency_code, c.notional,
               c.commission_bps, c.amount, c.created_at, l.ticker
          FROM broker_commissions c
          JOIN stock_trades t ON t.id = c.trade_id
          JOIN stock_listings l ON l.id = t.listing_id
         WHERE c.broker_actor_id = %s
         ORDER BY c.created_at DESC LIMIT %s
        """,
        (broker_actor_id, limit),
    ).fetchall()


def commission_total(conn, broker_actor_id: str, currency_code: str) -> Decimal:
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM broker_commissions "
        "WHERE broker_actor_id = %s AND currency_code = %s",
        (broker_actor_id, currency_code),
    ).fetchone()
    return Decimal(row["total"])


# ------------------------------------------------------------------ venues
def venues_of_listing(conn, listing_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT v.listing_id, v.exchange_id, v.fee_bps, v.status, v.created_at,
               e.code, e.name, e.kind
          FROM listing_venues v JOIN exchanges e ON e.id = v.exchange_id
         WHERE v.listing_id = %s
         ORDER BY e.kind DESC, e.code
        """,
        (listing_id,),
    ).fetchall()


def venues_for_listings(conn, listing_ids: list[str]) -> dict[str, list[dict]]:
    """Batch venue lookup so a listing page costs one query, not N (03 §5)."""
    if not listing_ids:
        return {}
    rows = conn.execute(
        """
        SELECT v.listing_id, v.exchange_id, v.fee_bps, v.status,
               e.code, e.name, e.kind
          FROM listing_venues v JOIN exchanges e ON e.id = v.exchange_id
         WHERE v.listing_id = ANY(%s)
         ORDER BY v.listing_id, e.kind DESC, e.code
        """,
        ([str(listing_id) for listing_id in listing_ids],),
    ).fetchall()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(str(row["listing_id"]), []).append(row)
    return grouped


def venue(conn, listing_id: str, exchange_id: str) -> dict | None:
    return conn.execute(
        "SELECT listing_id, exchange_id, fee_bps, status FROM listing_venues "
        "WHERE listing_id = %s AND exchange_id = %s",
        (listing_id, exchange_id),
    ).fetchone()


def add_venue(conn, *, listing_id: str, exchange_id: str, fee_bps: int,
              admitted_by: str) -> dict:
    return conn.execute(
        """
        INSERT INTO listing_venues (listing_id, exchange_id, fee_bps, admitted_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (listing_id, exchange_id) DO UPDATE SET status = 'active'
        RETURNING listing_id, exchange_id, fee_bps, status
        """,
        (listing_id, exchange_id, int(fee_bps), admitted_by),
    ).fetchone()


def set_venue_status(conn, listing_id: str, exchange_id: str, status: str) -> None:
    conn.execute(
        "UPDATE listing_venues SET status = %s WHERE listing_id = %s AND exchange_id = %s",
        (status, listing_id, exchange_id),
    )


# ------------------------------------------------------------- securities lending
# `securities_lending` is owned by this module (see infra/ownership.py). Stock code borrows
# and returns through these two functions instead of touching the table directly.
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


__all__ = [
    "membership", "membership_by_id", "upsert_membership", "set_membership_status",
    "memberships_of_exchange", "account_of_client", "open_account", "close_account",
    "clients_of_broker", "insert_commission", "commissions_of_broker", "commission_total",
    "venues_of_listing", "venues_for_listings", "venue", "add_venue", "set_venue_status", "json",
    "insert_lending", "mark_lending",
]
