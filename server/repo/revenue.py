"""Revenue collections and split runs."""

from __future__ import annotations

import json
from decimal import Decimal


def collect(conn, *, kind: str, currency_code: str, amount: Decimal,
            ref_type: str | None = None, ref_id: str | None = None) -> dict | None:
    if amount is None or Decimal(amount) <= 0:
        return None
    return conn.execute(
        """
        INSERT INTO revenue_collections (kind, currency_code, amount, ref_type, ref_id)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, kind, currency_code, amount, created_at
        """,
        (kind, currency_code, amount, ref_type, ref_id),
    ).fetchone()


def rules(conn) -> list[dict]:
    return conn.execute(
        "SELECT kind, label, currency_code, legs, status, updated_at "
        "FROM revenue_split_rules ORDER BY kind"
    ).fetchall()


def rule(conn, kind: str) -> dict | None:
    return conn.execute(
        "SELECT kind, label, currency_code, legs, status FROM revenue_split_rules "
        "WHERE kind = %s",
        (kind,),
    ).fetchone()


def pending(conn, kind: str) -> list[dict]:
    return conn.execute(
        "SELECT id, kind, currency_code, amount FROM revenue_collections "
        "WHERE kind = %s AND split_run_id IS NULL ORDER BY id FOR UPDATE",
        (kind,),
    ).fetchall()


def insert_run(conn, *, kind: str, currency_code: str, amount: Decimal, legs: list[dict],
               collections: int, ran_by: str) -> dict:
    return conn.execute(
        """
        INSERT INTO revenue_split_runs (kind, currency_code, amount, legs, collections, ran_by)
        VALUES (%s, %s, %s, %s::jsonb, %s, %s)
        RETURNING id, kind, currency_code, amount, legs, collections, created_at
        """,
        (kind, currency_code, amount, json.dumps(legs), collections, ran_by),
    ).fetchone()


def mark_split(conn, run_id: int, collection_ids: list[int]) -> None:
    if not collection_ids:
        return
    conn.execute(
        "UPDATE revenue_collections SET split_run_id = %s WHERE id = ANY(%s)",
        (run_id, collection_ids),
    )


def runs(conn, kind: str | None = None, limit: int = 20) -> list[dict]:
    if kind:
        return conn.execute(
            "SELECT id, kind, currency_code, amount, legs, collections, ran_by, created_at "
            "FROM revenue_split_runs WHERE kind = %s ORDER BY id DESC LIMIT %s",
            (kind, limit),
        ).fetchall()
    return conn.execute(
        "SELECT id, kind, currency_code, amount, legs, collections, ran_by, created_at "
        "FROM revenue_split_runs ORDER BY id DESC LIMIT %s",
        (limit,),
    ).fetchall()


def summary(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT kind,
               COUNT(*) FILTER (WHERE split_run_id IS NULL) AS pending_count,
               COALESCE(SUM(amount) FILTER (WHERE split_run_id IS NULL), 0) AS pending_amount,
               COUNT(*) AS total_count,
               COALESCE(SUM(amount), 0) AS total_amount
          FROM revenue_collections
         GROUP BY kind
         ORDER BY kind
        """
    ).fetchall()
