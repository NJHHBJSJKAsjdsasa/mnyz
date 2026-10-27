"""Property persistence: deeds, listings, bids, escrow, transfers and tax."""

from __future__ import annotations

from decimal import Decimal


def create_asset(
    conn,
    *,
    asset_key: str,
    kind: str,
    name: str,
    jurisdiction_sector: str,
    owner_actor_id: str | None,
    deed_no: str,
    base_by_type: Decimal,
    resource_score: Decimal = Decimal(0),
    development_level: int = 0,
    traffic_index: Decimal = Decimal(0),
) -> dict:
    return conn.execute(
        """
        INSERT INTO property_assets
               (asset_key, kind, name, jurisdiction_sector, owner_actor_id, deed_no,
                base_by_type, resource_score, development_level, traffic_index, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, asset_key, kind, name, jurisdiction_sector, owner_actor_id, deed_no,
                  base_by_type, resource_score, development_level, traffic_index,
                  recent_sale_premium, appraised_value, status, created_at
        """,
        (
            asset_key, kind, name, jurisdiction_sector, owner_actor_id, deed_no,
            base_by_type, resource_score, development_level, traffic_index,
            "owned" if owner_actor_id else "owned",
        ),
    ).fetchone()


def by_key(conn, asset_key: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, asset_key, kind, name, jurisdiction_sector, owner_actor_id, deed_no, "
        "base_by_type, resource_score, development_level, traffic_index, recent_sale_premium, "
        "appraised_value, appraised_at, status FROM property_assets WHERE asset_key = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (asset_key,)).fetchone()


def by_id(conn, asset_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, asset_key, kind, name, jurisdiction_sector, owner_actor_id, deed_no, "
        "base_by_type, resource_score, development_level, traffic_index, recent_sale_premium, "
        "appraised_value, status FROM property_assets WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (asset_id,)).fetchone()


def list_assets(
    conn, *, sector: str | None = None, kind: str | None = None,
    status: str | None = None, owner_actor_id: str | None = None, limit: int = 100
) -> list[dict]:
    clauses, params = [], []
    if sector:
        clauses.append("jurisdiction_sector = %s")
        params.append(sector)
    if kind:
        clauses.append("kind = %s")
        params.append(kind)
    if status:
        clauses.append("status = %s")
        params.append(status)
    if owner_actor_id:
        clauses.append("owner_actor_id = %s")
        params.append(owner_actor_id)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    return conn.execute(
        f"""
        SELECT id, asset_key, kind, name, jurisdiction_sector, owner_actor_id, deed_no,
               appraised_value, status
          FROM property_assets {where}
         ORDER BY appraised_value DESC LIMIT %s
        """,
        tuple(params),
    ).fetchall()


def set_appraisal(conn, asset_id: str, value: Decimal) -> None:
    conn.execute(
        "UPDATE property_assets SET appraised_value = %s, appraised_at = now() WHERE id = %s",
        (value, asset_id),
    )


def set_status(conn, asset_id: str, status: str) -> None:
    conn.execute("UPDATE property_assets SET status = %s WHERE id = %s", (status, asset_id))


def transfer_owner(conn, asset_id: str, to_actor_id: str, price: Decimal) -> None:
    conn.execute(
        """
        UPDATE property_assets
           SET owner_actor_id = %s, status = 'owned',
               recent_sale_premium = LEAST(1.0, GREATEST(-1.0, (%s - appraised_value)
                                         / GREATEST(appraised_value, 1)))
         WHERE id = %s
        """,
        (to_actor_id, price, asset_id),
    )


# ------------------------------------------------------------------ listings
def create_listing(
    conn, *, asset_id: str, seller_actor_id: str, kind: str, price: Decimal,
    min_increment: Decimal, expires_at
) -> dict:
    return conn.execute(
        """
        INSERT INTO property_listings (asset_id, seller_actor_id, kind, price, min_increment, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, asset_id, seller_actor_id, kind, price, min_increment, status,
                  created_at, expires_at
        """,
        (asset_id, seller_actor_id, kind, price, min_increment, expires_at),
    ).fetchone()


def listing(conn, listing_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, asset_id, seller_actor_id, kind, price, min_increment, status, "
        "created_at, expires_at FROM property_listings WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (listing_id,)).fetchone()


def open_listings(conn, *, limit: int = 100) -> list[dict]:
    return conn.execute(
        """
        SELECT l.id, l.asset_id, l.kind, l.price, l.min_increment, l.expires_at,
               a.asset_key, a.name, a.appraised_value, a.jurisdiction_sector
          FROM property_listings l
          JOIN property_assets a ON a.id = l.asset_id
         WHERE l.status IN ('open','escrow') AND l.expires_at > now()
         ORDER BY l.created_at DESC LIMIT %s
        """,
        (limit,),
    ).fetchall()


def set_listing_status(conn, listing_id: str, status: str) -> None:
    conn.execute(
        "UPDATE property_listings SET status = %s, closed_at = now() WHERE id = %s",
        (status, listing_id),
    )


# ------------------------------------------------------------------ bids
def insert_bid(conn, *, listing_id: str, bidder_actor_id: str, amount: Decimal) -> dict:
    return conn.execute(
        """
        INSERT INTO property_bids (listing_id, bidder_actor_id, amount)
        VALUES (%s, %s, %s)
        RETURNING id, listing_id, bidder_actor_id, amount, status, created_at
        """,
        (listing_id, bidder_actor_id, amount),
    ).fetchone()


def top_bid(conn, listing_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, listing_id, bidder_actor_id, amount, status FROM property_bids "
        "WHERE listing_id = %s AND status IN ('leading','outbid') ORDER BY amount DESC LIMIT 1"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (listing_id,)).fetchone()


def outbid_others(conn, listing_id: str, keep_bid_id: str) -> None:
    conn.execute(
        "UPDATE property_bids SET status = 'outbid' WHERE listing_id = %s AND id <> %s AND status = 'leading'",
        (listing_id, keep_bid_id),
    )


def set_bid_status(conn, bid_id: str, status: str) -> None:
    conn.execute("UPDATE property_bids SET status = %s WHERE id = %s", (status, bid_id))


# ------------------------------------------------------------------ escrow
def create_escrow(conn, *, listing_id: str, buyer_actor_id: str, amount: Decimal) -> dict:
    return conn.execute(
        """
        INSERT INTO property_escrow (listing_id, buyer_actor_id, amount)
        VALUES (%s, %s, %s)
        RETURNING id, listing_id, buyer_actor_id, amount, status
        """,
        (listing_id, buyer_actor_id, amount),
    ).fetchone()


def escrow_for(conn, listing_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, listing_id, buyer_actor_id, amount, status FROM property_escrow "
        "WHERE listing_id = %s AND status = 'held' ORDER BY created_at DESC LIMIT 1"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (listing_id,)).fetchone()


def set_escrow_status(conn, escrow_id: str, status: str) -> None:
    conn.execute(
        "UPDATE property_escrow SET status = %s, settled_at = now() WHERE id = %s",
        (status, escrow_id),
    )


def insert_transfer(
    conn, *, asset_id: str, from_actor_id: str | None, to_actor_id: str, price: Decimal,
    transfer_tax: Decimal, commission: Decimal, tx_id: str
) -> dict:
    return conn.execute(
        """
        INSERT INTO property_transfers
               (asset_id, from_actor_id, to_actor_id, price, transfer_tax, commission, tx_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, created_at
        """,
        (asset_id, from_actor_id, to_actor_id, price, transfer_tax, commission, tx_id),
    ).fetchone()


# ------------------------------------------------------------------ tax
def tax_rate(conn, sector: str, kind: str) -> int:
    row = conn.execute(
        "SELECT rate_bps FROM property_tax_rates WHERE jurisdiction_sector = %s AND kind = %s",
        (sector, kind),
    ).fetchone()
    return int(row["rate_bps"]) if row else 20


def upsert_bill(
    conn, *, asset_id: str, period, amount: Decimal, currency_code: str, due_at
) -> dict:
    return conn.execute(
        """
        INSERT INTO property_tax_bills (asset_id, period, amount, currency_code, due_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (asset_id, period) DO UPDATE
           SET amount = EXCLUDED.amount, due_at = EXCLUDED.due_at
         WHERE property_tax_bills.status = 'due'
        RETURNING id, asset_id, period, amount, status, due_at
        """,
        (asset_id, period, amount, currency_code, due_at),
    ).fetchone()


def bill(conn, bill_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT b.id, b.asset_id, b.period, b.amount, b.currency_code, b.due_at, b.status, "
        "a.owner_actor_id FROM property_tax_bills b "
        "JOIN property_assets a ON a.id = b.asset_id WHERE b.id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (bill_id,)).fetchone()


def mark_bill_paid(conn, bill_id: str, tx_id: str) -> None:
    conn.execute(
        "UPDATE property_tax_bills SET status = 'paid', paid_at = now(), tx_id = %s WHERE id = %s",
        (tx_id, bill_id),
    )


def bills_of(conn, actor_id: str, *, status: str = "due") -> list[dict]:
    return conn.execute(
        """
        SELECT b.id, b.asset_id, a.asset_key, b.period, b.amount, b.currency_code, b.due_at, b.status
          FROM property_tax_bills b
          JOIN property_assets a ON a.id = b.asset_id
         WHERE a.owner_actor_id = %s AND b.status = %s
         ORDER BY b.due_at
        """,
        (actor_id, status),
    ).fetchall()


def assets_for_tax(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT id, kind, jurisdiction_sector, appraised_value FROM property_assets
         WHERE owner_actor_id IS NOT NULL AND status IN ('owned','listed')
        """
    ).fetchall()


# ------------------------------------------------------------------ encumbrances
def open_encumbrances(conn, asset_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, kind, reason FROM property_encumbrances WHERE asset_id = %s AND released_at IS NULL",
        (asset_id,),
    ).fetchall()


def add_encumbrance(conn, asset_id: str, kind: str, reason: str = "") -> dict:
    return conn.execute(
        """
        INSERT INTO property_encumbrances (asset_id, kind, reason)
        VALUES (%s, %s, %s) RETURNING id, kind, created_at
        """,
        (asset_id, kind, reason),
    ).fetchone()


def release_encumbrance(conn, encumbrance_id: str) -> None:
    conn.execute("UPDATE property_encumbrances SET released_at = now() WHERE id = %s", (encumbrance_id,))


def assets_for_appraisal(conn, limit: int = 5000) -> list[dict]:
    return conn.execute(
        """
        SELECT id, asset_key, base_by_type, resource_score, development_level,
               traffic_index, recent_sale_premium
          FROM property_assets
         WHERE owner_actor_id IS NOT NULL
         ORDER BY appraised_at NULLS FIRST
         LIMIT %s
        """,
        (limit,),
    ).fetchall()
