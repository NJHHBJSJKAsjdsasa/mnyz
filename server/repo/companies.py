"""Company persistence: companies, holdings, financials, licences, index."""

from __future__ import annotations

from decimal import Decimal

from . import currency


def create(conn, *, ticker: str, name: str, founder_actor_id: str, shares_total: int,
           jurisdiction_sector: str, charter: dict | None = None) -> dict:
    actor = currency.create_actor(
        conn, code=f"company:{ticker}", kind="company", controller="system", display_name=name
    )
    import json

    return conn.execute(
        """
        INSERT INTO companies
               (ticker, name, founder_actor_id, treasury_actor_id, jurisdiction_sector,
                shares_total, charter)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id, ticker, name, founder_actor_id, treasury_actor_id, jurisdiction_sector,
                  status, shares_total, free_float, book_value, created_at
        """,
        (
            ticker,
            name,
            founder_actor_id,
            actor["id"],
            jurisdiction_sector,
            shares_total,
            json.dumps(charter or {}),
        ),
    ).fetchone()


def by_ticker(conn, ticker: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, ticker, name, founder_actor_id, treasury_actor_id, jurisdiction_sector, "
        "status, shares_total, free_float, book_value, charter, created_at, listed_at "
        "FROM companies WHERE ticker = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (ticker,)).fetchone()


def by_id(conn, company_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, ticker, name, founder_actor_id, treasury_actor_id, shares_total, "
        "status, free_float, book_value FROM companies WHERE id = %s",
        (company_id,),
    ).fetchone()


def list_companies(conn, *, status: str | None = None, limit: int = 100) -> list[dict]:
    if status:
        return conn.execute(
            "SELECT id, ticker, name, status, shares_total, free_float, book_value, created_at "
            "FROM companies WHERE status = %s ORDER BY created_at DESC LIMIT %s",
            (status, limit),
        ).fetchall()
    return conn.execute(
        "SELECT id, ticker, name, status, shares_total, free_float, book_value, created_at "
        "FROM companies ORDER BY created_at DESC LIMIT %s",
        (limit,),
    ).fetchall()


def ensure_holding(conn, actor_id: str, company_id: str, shares: int = 0) -> dict:
    row = conn.execute(
        """
        INSERT INTO share_holdings (actor_id, company_id, shares)
        VALUES (%s, %s, %s)
        ON CONFLICT (actor_id, company_id) DO NOTHING
        RETURNING actor_id, company_id, shares, locked_until
        """,
        (actor_id, company_id, shares),
    ).fetchone()
    if row is not None:
        return row
    return conn.execute(
        "SELECT actor_id, company_id, shares, locked_until FROM share_holdings "
        "WHERE actor_id = %s AND company_id = %s FOR UPDATE",
        (actor_id, company_id),
    ).fetchone()


def holding(conn, actor_id: str, company_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT actor_id, company_id, shares, locked_until FROM share_holdings "
        "WHERE actor_id = %s AND company_id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (actor_id, company_id)).fetchone()


def holdings_of(conn, company_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT h.actor_id, h.shares, h.locked_until, a.display_name, a.code
          FROM share_holdings h
          JOIN economic_actors a ON a.id = h.actor_id
         WHERE h.company_id = %s AND h.shares > 0
         ORDER BY h.shares DESC
        """,
        (company_id,),
    ).fetchall()


def adjust_holding(conn, actor_id: str, company_id: str, delta: int) -> int | None:
    row = conn.execute(
        """
        UPDATE share_holdings SET shares = shares + %s, updated_at = now()
         WHERE actor_id = %s AND company_id = %s AND shares + %s >= 0
        RETURNING shares
        """,
        (delta, actor_id, company_id, delta),
    ).fetchone()
    return int(row["shares"]) if row else None


def set_free_float(conn, company_id: str, value: int) -> None:
    conn.execute("UPDATE companies SET free_float = %s WHERE id = %s", (value, company_id))


def set_status(conn, company_id: str, status: str) -> None:
    conn.execute("UPDATE companies SET status = %s WHERE id = %s", (status, company_id))


def mark_public(conn, company_id: str, *, shares_total: int, free_float: int) -> None:
    """IPO: new shares are issued and the company becomes tradable (05 §3.2)."""
    conn.execute(
        """
        UPDATE companies
           SET shares_total = %s, free_float = %s, status = 'public', listed_at = now()
         WHERE id = %s
        """,
        (shares_total, free_float, company_id),
    )


def upsert_financials(
    conn, *, company_id: str, period, revenue: Decimal, cost: Decimal,
    assets: Decimal, liabilities: Decimal
) -> dict:
    return conn.execute(
        """
        INSERT INTO company_financials (company_id, period, revenue, cost, profit, assets, liabilities)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (company_id, period) DO UPDATE
           SET revenue = EXCLUDED.revenue, cost = EXCLUDED.cost, profit = EXCLUDED.profit,
               assets = EXCLUDED.assets, liabilities = EXCLUDED.liabilities, published_at = now()
        RETURNING company_id, period, revenue, cost, profit, assets, liabilities, published_at
        """,
        (company_id, period, revenue, cost, revenue - cost, assets, liabilities),
    ).fetchone()


def financials(conn, company_id: str) -> list[dict]:
    return conn.execute(
        "SELECT period, revenue, cost, profit, assets, liabilities, published_at "
        "FROM company_financials WHERE company_id = %s ORDER BY period DESC LIMIT 12",
        (company_id,),
    ).fetchall()


def insert_action(conn, company_id: str, kind: str, payload: dict) -> dict:
    import json

    return conn.execute(
        """
        INSERT INTO company_actions (company_id, kind, payload)
        VALUES (%s, %s, %s::jsonb)
        RETURNING id, kind, status, created_at
        """,
        (company_id, kind, json.dumps(payload)),
    ).fetchone()


# ------------------------------------------------------------------ licences
def issue_license(
    conn, *, actor_id: str, kind: str, fee_currency: str, monthly_fee: Decimal,
    reviewed_by: str, expires_at=None, status: str = "active"
) -> dict:
    """Insert a licence row.

    ``status`` defaults to ``active`` because that is the table default and the
    historical behaviour (grants were issued directly). Applications go through
    ``status="pending"`` so the review step has something to act on.
    """
    return conn.execute(
        """
        INSERT INTO commerce_licenses
               (actor_id, kind, status, fee_currency, monthly_fee, reviewed_by, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, actor_id, kind, status, fee_currency, monthly_fee, issued_at, expires_at
        """,
        (actor_id, kind, status, fee_currency, monthly_fee, reviewed_by, expires_at),
    ).fetchone()


def active_license(conn, actor_id: str, kind: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, actor_id, kind, status, expires_at FROM commerce_licenses
         WHERE actor_id = %s AND kind = %s AND status = 'active'
           AND (expires_at IS NULL OR expires_at > now())
         LIMIT 1
        """,
        (actor_id, kind),
    ).fetchone()


def licenses_of(conn, actor_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, kind, status, fee_currency, monthly_fee, issued_at, expires_at "
        "FROM commerce_licenses WHERE actor_id = %s ORDER BY issued_at DESC",
        (actor_id,),
    ).fetchall()


def license_by_id(conn, license_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, actor_id, kind, status, fee_currency, monthly_fee, reviewed_by,
               issued_at, expires_at
          FROM commerce_licenses WHERE id = %s
        """,
        (license_id,),
    ).fetchone()


def pending_license(conn, actor_id: str, kind: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, actor_id, kind, status, fee_currency, monthly_fee, issued_at
          FROM commerce_licenses
         WHERE actor_id = %s AND kind = %s AND status = 'pending'
         LIMIT 1
        """,
        (actor_id, kind),
    ).fetchone()


def decide_license(conn, license_id: str, *, status: str, reviewed_by: str, expires_at=None) -> dict:
    return conn.execute(
        """
        UPDATE commerce_licenses
           SET status = %s, reviewed_by = %s, expires_at = %s,
               issued_at = CASE WHEN %s = 'active' THEN now() ELSE issued_at END
         WHERE id = %s
        RETURNING id, actor_id, kind, status, fee_currency, monthly_fee,
                  reviewed_by, issued_at, expires_at
        """,
        (status, reviewed_by, expires_at, status, license_id),
    ).fetchone()


def pending_licenses(conn, limit: int = 100) -> list[dict]:
    return conn.execute(
        """
        SELECT id, actor_id, kind, status, fee_currency, monthly_fee, issued_at
          FROM commerce_licenses
         WHERE status = 'pending'
         ORDER BY issued_at
         LIMIT %s
        """,
        (limit,),
    ).fetchall()


def set_license_status(conn, license_id: str, status: str) -> None:
    conn.execute("UPDATE commerce_licenses SET status = %s WHERE id = %s", (status, license_id))


# ------------------------------------------------------------------ index
def upsert_index(conn, *, sector_key: str, period, index_value: Decimal, sample_size: int) -> dict:
    return conn.execute(
        """
        INSERT INTO commerce_price_index (sector_key, period, index_value, sample_size)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (sector_key, period) DO UPDATE
           SET index_value = EXCLUDED.index_value, sample_size = EXCLUDED.sample_size
        RETURNING sector_key, period, index_value, sample_size
        """,
        (sector_key, period, index_value, sample_size),
    ).fetchone()


def latest_index(conn, sector_key: str, limit: int = 30) -> list[dict]:
    return conn.execute(
        "SELECT period, index_value, sample_size FROM commerce_price_index "
        "WHERE sector_key = %s ORDER BY period DESC LIMIT %s",
        (sector_key, limit),
    ).fetchall()


def insert_share_snapshot(conn, *, actor_id: str, sector_key: str, period, share: Decimal, hhi: Decimal) -> None:
    conn.execute(
        """
        INSERT INTO market_share_snapshots (actor_id, sector_key, period, share, hhi)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (actor_id, sector_key, period) DO UPDATE
           SET share = EXCLUDED.share, hhi = EXCLUDED.hhi
        """,
        (actor_id, sector_key, period, share, hhi),
    )


def update_capital(conn, company_id: str, *, shares_total: int, free_float: int) -> dict:
    """Buyback / issuance / reduction move the share count; voting quorums read it."""
    return conn.execute(
        """
        UPDATE companies
           SET shares_total = %s, free_float = %s
         WHERE id = %s
        RETURNING id, ticker, shares_total, free_float
        """,
        (int(shares_total), int(free_float), company_id),
    ).fetchone()


def due_licenses(conn, limit: int = 500) -> list[dict]:
    """Active licences whose paid term has ended; the renewal job owns them."""
    return conn.execute(
        """
        SELECT id, actor_id, kind, status, fee_currency, monthly_fee, expires_at
          FROM commerce_licenses
         WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
         ORDER BY expires_at
         LIMIT %s
        """,
        (limit,),
    ).fetchall()


def extend_license(conn, license_id: str, *, expires_at) -> dict:
    return conn.execute(
        "UPDATE commerce_licenses SET expires_at = %s WHERE id = %s "
        "RETURNING id, actor_id, kind, status, fee_currency, monthly_fee, expires_at",
        (expires_at, license_id),
    ).fetchone()
