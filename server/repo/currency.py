"""Currency persistence: actors, accounts, ledger, issuance, exchange quotes.

Only :mod:`server.domain.currency_service` writes here; API and jobs must go
through the domain layer.
"""

from __future__ import annotations

from decimal import Decimal

_COLUMNS = "actor_id, currency_code, balance, frozen"


# ------------------------------------------------------------------ actors
def actor_for_player(conn, player_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, code, kind, controller, player_id, allow_negative, display_name
          FROM economic_actors WHERE player_id = %s
        """,
        (player_id,),
    ).fetchone()


def actor_by_id(conn, actor_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, code, kind, controller, player_id, allow_negative, display_name
          FROM economic_actors WHERE id = %s
        """,
        (actor_id,),
    ).fetchone()


def actor_by_code(conn, code: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, code, kind, controller, player_id, allow_negative, display_name
          FROM economic_actors WHERE code = %s
        """,
        (code,),
    ).fetchone()


def create_player_actor(conn, player_id: str, display_name: str, controller: str = "human") -> dict:
    return conn.execute(
        """
        INSERT INTO economic_actors (kind, controller, player_id, display_name)
        VALUES ('player', %s, %s, %s)
        ON CONFLICT (player_id) DO NOTHING
        RETURNING id, code, kind, controller, player_id, allow_negative, display_name
        """,
        (controller, player_id, display_name),
    ).fetchone()


def player_actors(conn, player_ids: list[str]) -> list[dict]:
    if not player_ids:
        return []
    return conn.execute(
        """
        SELECT id, player_id FROM economic_actors
         WHERE player_id = ANY(%s) AND kind = 'player'
        """,
        (player_ids,),
    ).fetchall()


SYSTEM_ACTORS: tuple[tuple[str, str, bool], ...] = (
    ("treasury", "treasury", True),
    ("burn", "burn", False),
    ("cb", "central_bank", True),
    ("market", "market", False),
    ("officer_pool", "officer", False),
    ("bank_equity", "equity", True),
    ("insurance_fund", "fund", False),
    ("compliance_fund", "fund", False),
    ("escrow", "market", False),
)


def ensure_system_actors(conn) -> None:
    """Idempotent seed; production gets these from migration 0110."""
    for code, kind, allow_negative in SYSTEM_ACTORS:
        conn.execute(
            """
            INSERT INTO economic_actors (code, kind, controller, display_name, allow_negative)
            VALUES (%s, %s, 'system', %s, %s)
            ON CONFLICT (code) DO NOTHING
            """,
            (code, kind, code, allow_negative),
        )


# ------------------------------------------------------------------ currencies
def currencies(conn) -> list[dict]:
    return conn.execute(
        "SELECT code, quality, name, base_value, is_high_tier, status "
        "FROM currencies ORDER BY quality"
    ).fetchall()


def currency(conn, code: str) -> dict | None:
    return conn.execute(
        "SELECT code, quality, name, base_value, is_high_tier, status "
        "FROM currencies WHERE code = %s",
        (code,),
    ).fetchone()


# ------------------------------------------------------------------ accounts
def ensure_account(conn, actor_id: str, currency_code: str) -> dict:
    row = conn.execute(
        f"""
        INSERT INTO currency_accounts (actor_id, currency_code)
        VALUES (%s, %s)
        ON CONFLICT (actor_id, currency_code) DO NOTHING
        RETURNING {_COLUMNS}
        """,
        (actor_id, currency_code),
    ).fetchone()
    if row is not None:
        return row
    return conn.execute(
        f"SELECT {_COLUMNS} FROM currency_accounts WHERE actor_id = %s AND currency_code = %s",
        (actor_id, currency_code),
    ).fetchone()


def account(conn, actor_id: str, currency_code: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {_COLUMNS} FROM currency_accounts WHERE actor_id = %s AND currency_code = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (actor_id, currency_code)).fetchone()


def lock_accounts(conn, keys: list[tuple[str, str]]) -> dict[tuple[str, str], dict]:
    """Lock several accounts in a stable order (00 §4.4: actor -> currency)."""
    ordered = sorted(set(keys), key=lambda item: (str(item[0]), item[1]))
    rows = conn.execute(
        f"""
        SELECT {_COLUMNS} FROM currency_accounts
         WHERE (actor_id, currency_code) IN (
               SELECT * FROM unnest(%s::uuid[], %s::text[])
         )
         ORDER BY actor_id, currency_code
         FOR UPDATE
        """,
        ([k[0] for k in ordered], [k[1] for k in ordered]),
    ).fetchall()
    return {(row["actor_id"], row["currency_code"]): row for row in rows}


def adjust(conn, actor_id: str, currency_code: str, delta: Decimal) -> Decimal | None:
    """Conditional update; ``None`` means the account would go negative."""
    row = conn.execute(
        """
        UPDATE currency_accounts
           SET balance = balance + %s, updated_at = now()
         WHERE actor_id = %s AND currency_code = %s AND balance + %s >= 0
        RETURNING balance
        """,
        (delta, actor_id, currency_code, delta),
    ).fetchone()
    return Decimal(row["balance"]) if row else None


def force_adjust(conn, actor_id: str, currency_code: str, delta: Decimal) -> Decimal:
    """Unconditional update for accounts allowed to go negative (treasury/equity)."""
    row = conn.execute(
        """
        UPDATE currency_accounts
           SET balance = balance + %s, updated_at = now()
         WHERE actor_id = %s AND currency_code = %s
        RETURNING balance
        """,
        (delta, actor_id, currency_code),
    ).fetchone()
    return Decimal(row["balance"])


def set_actor_status(conn, actor_id: str, status: str) -> None:
    conn.execute("UPDATE economic_actors SET status = %s WHERE id = %s", (status, actor_id))


def freeze_balance(conn, actor_id: str, currency_code: str) -> Decimal:
    row = conn.execute(
        """
        UPDATE currency_accounts SET frozen = balance, updated_at = now()
         WHERE actor_id = %s AND currency_code = %s
        RETURNING frozen
        """,
        (actor_id, currency_code),
    ).fetchone()
    return Decimal(row["frozen"]) if row else Decimal(0)


def balances(conn, actor_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT a.currency_code, c.name, c.quality, c.base_value, a.balance, a.frozen
          FROM currency_accounts a
          JOIN currencies c ON c.code = a.currency_code
         WHERE a.actor_id = %s
         ORDER BY c.quality
        """,
        (actor_id,),
    ).fetchall()


# ------------------------------------------------------------------ ledger
def insert_transaction(
    conn,
    *,
    kind: str,
    ref_type: str | None,
    ref_id: str | None,
    idempotency_key: str | None,
    memo: str = "",
) -> dict:
    return conn.execute(
        """
        INSERT INTO currency_ledger_transactions (kind, ref_type, ref_id, idempotency_key, memo)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, kind, ref_type, ref_id, created_at
        """,
        (kind, ref_type, ref_id, idempotency_key, memo),
    ).fetchone()


def transaction_by_idempotency(conn, key: str) -> dict | None:
    return conn.execute(
        "SELECT id, kind, ref_type, ref_id, created_at "
        "FROM currency_ledger_transactions WHERE idempotency_key = %s",
        (key,),
    ).fetchone()


def insert_entry(
    conn, *, tx_id: str, actor_id: str, currency_code: str, delta: Decimal, balance_after: Decimal
) -> None:
    conn.execute(
        """
        INSERT INTO currency_ledger_entries
               (tx_id, actor_id, currency_code, delta, balance_after)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (tx_id, actor_id, currency_code, delta, balance_after),
    )


def entries_for(conn, tx_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT e.actor_id, e.currency_code, e.delta, e.balance_after, a.code AS actor_code
          FROM currency_ledger_entries e
          JOIN economic_actors a ON a.id = e.actor_id
         WHERE e.tx_id = %s
         ORDER BY e.id
        """,
        (tx_id,),
    ).fetchall()


def insert_transfer(
    conn,
    *,
    from_actor_id: str,
    to_actor_id: str,
    currency_code: str,
    amount: Decimal,
    memo: str,
    tx_id: str,
) -> dict:
    return conn.execute(
        """
        INSERT INTO currency_transfers
               (from_actor_id, to_actor_id, currency_code, amount, memo, tx_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, created_at
        """,
        (from_actor_id, to_actor_id, currency_code, amount, memo, tx_id),
    ).fetchone()


def recent_entries(conn, actor_id: str, limit: int = 50) -> list[dict]:
    return conn.execute(
        """
        SELECT e.tx_id, e.currency_code, e.delta, e.balance_after, e.created_at,
               t.kind, t.ref_type, t.ref_id
          FROM currency_ledger_entries e
          JOIN currency_ledger_transactions t ON t.id = e.tx_id
         WHERE e.actor_id = %s
         ORDER BY e.id DESC
         LIMIT %s
        """,
        (actor_id, limit),
    ).fetchall()


# ------------------------------------------------------------------ exchange
def fee_tiers(conn) -> list[dict]:
    return conn.execute(
        "SELECT max_q1_equiv, rate FROM exchange_fee_tiers ORDER BY max_q1_equiv NULLS LAST"
    ).fetchall()


def insert_quote(
    conn,
    *,
    from_code: str,
    to_code: str,
    mid: Decimal,
    spread_bps: int,
    bank_buy: Decimal,
    bank_sell: Decimal,
    source_bank_id: str | None = None,
) -> dict:
    return conn.execute(
        """
        INSERT INTO currency_exchange_quotes
               (from_code, to_code, source_bank_id, mid, spread_bps, bank_buy, bank_sell, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, now() + interval '60 seconds')
        RETURNING id, quoted_at, expires_at
        """,
        (from_code, to_code, source_bank_id, mid, spread_bps, bank_buy, bank_sell),
    ).fetchone()


# ------------------------------------------------------------------ issuance
def active_policy(conn) -> dict | None:
    return conn.execute(
        """
        SELECT id, active_weight, volume_factor, min_daily, max_daily, reward_share,
               bribe_enabled, effective_at
          FROM currency_issuance_policy WHERE status = 'active'
        """
    ).fetchone()


def policy_by_id(conn, policy_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT id, active_weight, volume_factor, min_daily, max_daily, reward_share, bribe_enabled
          FROM currency_issuance_policy WHERE id = %s
        """,
        (policy_id,),
    ).fetchone()


def issuance_for_day(conn, day) -> dict | None:
    return conn.execute(
        "SELECT id, day, raw_amount, emitted_amount, policy_id FROM currency_issuance WHERE day = %s",
        (day,),
    ).fetchone()


def record_issuance(conn, *, day, raw_amount: Decimal, emitted_amount: Decimal, policy_id: str) -> dict:
    return conn.execute(
        """
        INSERT INTO currency_issuance (day, raw_amount, emitted_amount, policy_id)
        VALUES (%s, %s, %s, %s)
        RETURNING id, day, raw_amount, emitted_amount
        """,
        (day, raw_amount, emitted_amount, policy_id),
    ).fetchone()


def raw_history(conn, limit: int = 7) -> list[Decimal]:
    rows = conn.execute(
        "SELECT raw_amount FROM currency_issuance ORDER BY day DESC LIMIT %s",
        (limit,),
    ).fetchall()
    return [Decimal(row["raw_amount"]) for row in rows]
