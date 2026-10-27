"""Ledger persistence. Entries are append-only at the DB privilege level too."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class NewTransaction:
    id: str
    player_id: str
    kind: str
    ref_type: str | None = None
    ref_id: str | None = None
    idem_key: str | None = None


@dataclass(frozen=True)
class NewEntry:
    tx_id: str
    resource_code: str
    delta: Decimal
    balance_after: Decimal
    wallet_id: str | None = None
    system_code: str | None = None


def find_transaction_by_idempotency(conn, idem_key: str) -> dict | None:
    return conn.execute(
        "SELECT id, player_id, kind FROM ledger_transactions WHERE idempotency_key = %s",
        (idem_key,),
    ).fetchone()


def insert_transaction(conn, spec: NewTransaction) -> None:
    conn.execute(
        """
        INSERT INTO ledger_transactions (id, player_id, kind, ref_type, ref_id, idempotency_key)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (spec.id, spec.player_id, spec.kind, spec.ref_type, spec.ref_id, spec.idem_key),
    )


def insert_entry(conn, spec: NewEntry) -> None:
    conn.execute(
        """
        INSERT INTO ledger_entries
               (transaction_id, wallet_id, system_account_code, resource_code, delta, balance_after)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            spec.tx_id,
            spec.wallet_id,
            spec.system_code,
            spec.resource_code,
            spec.delta,
            spec.balance_after,
        ),
    )


def entries_for(conn, tx_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT id, wallet_id, system_account_code, resource_code, delta, balance_after, created_at
          FROM ledger_entries WHERE transaction_id = %s ORDER BY id
        """,
        (tx_id,),
    ).fetchall()


def system_balance(conn, system_code: str, resource_code: str) -> Decimal:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(delta), 0) AS total FROM ledger_entries
         WHERE system_account_code = %s AND resource_code = %s
        """,
        (system_code, resource_code),
    ).fetchone()
    return Decimal(row["total"])


def unbalanced_transactions(conn, hours: int = 2) -> list[dict]:
    return conn.execute(
        """
        SELECT transaction_id, SUM(delta) AS total
          FROM ledger_entries
         WHERE created_at >= now() - make_interval(hours => %s)
         GROUP BY transaction_id
        HAVING SUM(delta) <> 0
        """,
        (hours,),
    ).fetchall()


def mismatched_wallets(conn) -> list[dict]:
    return conn.execute(
        """
        SELECT w.player_id, w.resource_code, w.balance, COALESCE(SUM(e.delta), 0) AS ledger
          FROM wallets w
          LEFT JOIN ledger_entries e
                 ON e.wallet_id = w.player_id AND e.resource_code = w.resource_code
         GROUP BY w.player_id, w.resource_code, w.balance
        HAVING w.balance <> COALESCE(SUM(e.delta), 0)
         LIMIT 100
        """
    ).fetchall()
