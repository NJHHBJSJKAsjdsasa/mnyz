"""Cross-region 2PC persistence: transaction log, participants, decisions, outbox."""

from __future__ import annotations

import json
from decimal import Decimal

TX_COLUMNS = (
    "id, kind, status, coordinator_id, coordinator_region, origin_region, payload, "
    "notional, currency_code, fee_bps, fee_amount, idempotency_key, retries, "
    "deadline_at, unknown_since, decided_at, last_error, created_at"
)


def config(conn) -> dict:
    return conn.execute(
        "SELECT budget_ms, prepare_ms, commit_ms, lease_seconds, unknown_after_ms, "
        "freeze_after_ms, capacity FROM dt_config WHERE id = 1"
    ).fetchone()


def update_config(conn, **fields) -> dict:
    allowed = {"budget_ms", "prepare_ms", "commit_ms", "lease_seconds",
               "unknown_after_ms", "freeze_after_ms", "capacity"}
    sets, params = [], []
    for key, value in fields.items():
        if key not in allowed or value is None:
            continue
        sets.append(f"{key} = %s")
        params.append(int(value))
    if sets:
        conn.execute(
            f"UPDATE dt_config SET {', '.join(sets)}, updated_at = now() WHERE id = 1", params
        )
    return config(conn)


# ------------------------------------------------------------------ transactions
def insert_tx(
    conn,
    *,
    kind: str,
    payload: dict,
    origin_region: str,
    coordinator_id: str,
    coordinator_region: str,
    fee_bps: int,
    fee_amount: Decimal,
    notional: Decimal,
    currency_code: str | None,
    deadline_at,
    idempotency_key: str | None,
) -> dict:
    return conn.execute(
        f"""
        INSERT INTO distributed_transactions
               (kind, status, coordinator_id, coordinator_region, origin_region, payload,
                notional, currency_code, fee_bps, fee_amount, deadline_at, idempotency_key)
        VALUES (%s, 'preparing', %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s)
        RETURNING {TX_COLUMNS}
        """,
        (kind, coordinator_id, coordinator_region, origin_region,
         json.dumps(payload, default=str), notional, currency_code, fee_bps, fee_amount,
         deadline_at, idempotency_key),
    ).fetchone()


def tx_by_id(conn, tx_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {TX_COLUMNS} FROM distributed_transactions WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (tx_id,)).fetchone()


def tx_by_idempotency(conn, key: str) -> dict | None:
    return conn.execute(
        f"SELECT {TX_COLUMNS} FROM distributed_transactions WHERE idempotency_key = %s", (key,)
    ).fetchone()


def set_tx_status(conn, tx_id: str, status: str, *, decided: bool = False,
                  error: str | None = None, unknown: bool = False) -> None:
    sets = ["status = %s"]
    params: list = [status]
    if decided:
        sets.append("decided_at = now()")
    if error is not None:
        sets.append("last_error = %s")
        params.append(error)
    sets.append("unknown_since = CASE WHEN %s THEN now() ELSE unknown_since END")
    params.append(unknown)
    params.append(tx_id)
    conn.execute(f"UPDATE distributed_transactions SET {', '.join(sets)} WHERE id = %s", params)


def bump_retry(conn, tx_id: str) -> None:
    conn.execute(
        "UPDATE distributed_transactions SET retries = retries + 1 WHERE id = %s", (tx_id,)
    )


def open_txs(conn, statuses: tuple[str, ...], limit: int = 100) -> list[dict]:
    return conn.execute(
        f"SELECT {TX_COLUMNS} FROM distributed_transactions "
        "WHERE status = ANY(%s) ORDER BY deadline_at LIMIT %s",
        (list(statuses), limit),
    ).fetchall()


def stats(conn) -> list[dict]:
    return conn.execute(
        "SELECT status, COUNT(*) AS n FROM distributed_transactions GROUP BY status"
    ).fetchall()


# ------------------------------------------------------------------ participants
def insert_participant(conn, tx_id: str, participant_id: str, region: str) -> dict:
    return conn.execute(
        """
        INSERT INTO dt_participants (tx_id, participant_id, region)
        VALUES (%s, %s, %s)
        ON CONFLICT (tx_id, participant_id) DO NOTHING
        RETURNING tx_id, participant_id, region, status
        """,
        (tx_id, participant_id, region),
    ).fetchone()


def participants_of(conn, tx_id: str, *, for_update: bool = False) -> list[dict]:
    sql = ("SELECT tx_id, participant_id, region, status, attempts, prepared_at, "
           "committed_at, last_error FROM dt_participants WHERE tx_id = %s "
           "ORDER BY participant_id")
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (tx_id,)).fetchall()


def set_participant(conn, tx_id: str, participant_id: str, status: str,
                    *, error: str | None = None) -> None:
    sets = ["status = %s", "attempts = attempts + 1"]
    params: list = [status]
    if status == "prepared":
        sets.append("prepared_at = now()")
    if status == "committed":
        sets.append("committed_at = now()")
    if error is not None:
        sets.append("last_error = %s")
        params.append(error)
    params.extend([tx_id, participant_id])
    conn.execute(
        f"UPDATE dt_participants SET {', '.join(sets)} WHERE tx_id = %s AND participant_id = %s",
        params,
    )


# ------------------------------------------------------------------ decisions
def add_decision(conn, tx_id: str, decision: str, reason: str, decided_by: str) -> dict:
    return conn.execute(
        """
        INSERT INTO dt_decisions (tx_id, decision, reason, decided_by)
        VALUES (%s, %s, %s, %s)
        RETURNING id, tx_id, decision, reason, decided_by, created_at
        """,
        (tx_id, decision, reason, decided_by),
    ).fetchone()


def decisions_of(conn, tx_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, decision, reason, decided_by, created_at FROM dt_decisions "
        "WHERE tx_id = %s ORDER BY id",
        (tx_id,),
    ).fetchall()


# ------------------------------------------------------------------ outbox
def add_outbox(conn, tx_id: str, event_type: str, payload: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO dt_outbox (tx_id, event_type, payload)
        VALUES (%s, %s, %s::jsonb)
        RETURNING id, tx_id, event_type, created_at
        """,
        (tx_id, event_type, json.dumps(payload, default=str)),
    ).fetchone()


def pending_outbox(conn, limit: int = 100) -> list[dict]:
    return conn.execute(
        "SELECT id, tx_id, event_type, payload, created_at FROM dt_outbox "
        "WHERE published_at IS NULL ORDER BY id LIMIT %s",
        (limit,),
    ).fetchall()


def mark_published(conn, event_id: int) -> None:
    conn.execute("UPDATE dt_outbox SET published_at = now() WHERE id = %s", (event_id,))


def outbox_of(conn, tx_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, event_type, payload, published_at FROM dt_outbox WHERE tx_id = %s ORDER BY id",
        (tx_id,),
    ).fetchall()


# ------------------------------------------------------------------ lease
def upsert_lease(conn, tx_id: str, coordinator_id: str, region: str, lease_until) -> dict:
    return conn.execute(
        """
        INSERT INTO dt_coordinator_lease (tx_id, coordinator_id, region, lease_until)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (tx_id) DO UPDATE
           SET coordinator_id = EXCLUDED.coordinator_id,
               region = EXCLUDED.region,
               lease_until = EXCLUDED.lease_until
        RETURNING tx_id, coordinator_id, region, lease_until
        """,
        (tx_id, coordinator_id, region, lease_until),
    ).fetchone()


def lease_of(conn, tx_id: str, *, for_update: bool = False) -> dict | None:
    sql = ("SELECT tx_id, coordinator_id, region, lease_until FROM dt_coordinator_lease "
           "WHERE tx_id = %s")
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (tx_id,)).fetchone()


def expired_leases(conn) -> list[dict]:
    return conn.execute(
        "SELECT tx_id, coordinator_id, region, lease_until FROM dt_coordinator_lease "
        "WHERE lease_until <= now() ORDER BY lease_until"
    ).fetchall()
