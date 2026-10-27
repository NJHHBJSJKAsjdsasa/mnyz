"""Bank persistence: banks, client accounts, reserves, loans, rate history."""

from __future__ import annotations

from decimal import Decimal


def list_banks(conn, *, status: str | None = "active") -> list[dict]:
    if status:
        rows = conn.execute(
            """
            SELECT b.id, b.code, b.name, b.kind, b.currency_code, b.reserve_ratio, b.status,
                   COUNT(a.id) AS accounts
              FROM banks b
              LEFT JOIN bank_accounts a ON a.bank_id = b.id AND a.status = 'active'
             WHERE b.status = %s
             GROUP BY b.id
             ORDER BY b.kind, b.code
            """,
            (status,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT b.id, b.code, b.name, b.kind, b.currency_code, b.reserve_ratio, b.status,
                   COUNT(a.id) AS accounts
              FROM banks b
              LEFT JOIN bank_accounts a ON a.bank_id = b.id AND a.status = 'active'
             GROUP BY b.id
             ORDER BY b.kind, b.code
            """
        ).fetchall()
    return rows


def lock_bank(conn, bank_id: str) -> None:
    """Serialize all mutations of one bank before any balance lock is taken.

    Ordering: bank advisory lock -> currency accounts -> bank rows. A single
    deterministic entry point is what keeps deposit and loan paths from
    deadlocking on the same actor account (00 §4.4).
    """
    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (str(bank_id),))


def by_id(conn, bank_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, code, name, kind, actor_id, currency_code, reserve_ratio, status "
        "FROM banks WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (bank_id,)).fetchone()


def by_code(conn, code: str) -> dict | None:
    return conn.execute(
        "SELECT id, code, name, kind, actor_id, currency_code, reserve_ratio, status "
        "FROM banks WHERE code = %s",
        (code,),
    ).fetchone()


def create(
    conn,
    *,
    code: str,
    name: str,
    kind: str = "commercial",
    owner_actor_id: str | None = None,
    currency_code: str = "cc1",
    reserve_ratio: Decimal = Decimal("0.15"),
) -> dict:
    """Create a bank plus its economic actor in one shot."""
    actor = conn.execute(
        """
        INSERT INTO economic_actors (code, kind, controller, display_name)
        VALUES ('bank:' || %s, 'bank', 'system', %s)
        RETURNING id
        """,
        (code, name),
    ).fetchone()
    return conn.execute(
        """
        INSERT INTO banks (code, name, kind, owner_actor_id, actor_id, currency_code, reserve_ratio)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, code, name, kind, actor_id, currency_code, reserve_ratio, status
        """,
        (code, name, kind, owner_actor_id, actor["id"], currency_code, reserve_ratio),
    ).fetchone()


def ensure_central_bank(conn) -> None:
    """Idempotent seed; production gets this from migration 0110."""
    conn.execute(
        """
        INSERT INTO economic_actors (code, kind, controller, display_name)
        VALUES ('bank:ccb', 'bank', 'system', '宇宙中央银行')
        ON CONFLICT (code) DO NOTHING
        """
    )
    conn.execute(
        """
        INSERT INTO banks (code, name, kind, actor_id, currency_code)
        SELECT 'ccb', '宇宙中央银行', 'central', a.id, 'cc1'
          FROM economic_actors a WHERE a.code = 'bank:ccb'
        ON CONFLICT (code) DO NOTHING
        """
    )


# ------------------------------------------------------------------ accounts
def account(conn, bank_id: str, actor_id: str, currency_code: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, bank_id, actor_id, currency_code, balance, status "
        "FROM bank_accounts WHERE bank_id = %s AND actor_id = %s AND currency_code = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (bank_id, actor_id, currency_code)).fetchone()


def ensure_account(conn, bank_id: str, actor_id: str, currency_code: str) -> dict:
    row = conn.execute(
        """
        INSERT INTO bank_accounts (bank_id, actor_id, currency_code)
        VALUES (%s, %s, %s)
        ON CONFLICT (bank_id, actor_id, currency_code) DO NOTHING
        RETURNING id, bank_id, actor_id, currency_code, balance, status
        """,
        (bank_id, actor_id, currency_code),
    ).fetchone()
    if row is not None:
        return row
    return account(conn, bank_id, actor_id, currency_code)


def adjust_account(conn, account_id: str, delta: Decimal) -> Decimal | None:
    row = conn.execute(
        """
        UPDATE bank_accounts
           SET balance = balance + %s, updated_at = now()
         WHERE id = %s AND balance + %s >= 0
        RETURNING balance
        """,
        (delta, account_id, delta),
    ).fetchone()
    return Decimal(row["balance"]) if row else None


def accounts_of(conn, actor_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT a.id, a.bank_id, b.code AS bank_code, b.name AS bank_name,
               a.currency_code, a.balance, a.status
          FROM bank_accounts a
          JOIN banks b ON b.id = a.bank_id
         WHERE a.actor_id = %s AND a.status = 'active'
         ORDER BY b.code, a.currency_code
        """,
        (actor_id,),
    ).fetchall()


def deposits_total(conn, bank_id: str, currency_code: str) -> Decimal:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(balance), 0) AS total FROM bank_accounts
         WHERE bank_id = %s AND currency_code = %s AND status = 'active'
        """,
        (bank_id, currency_code),
    ).fetchone()
    return Decimal(row["total"])


# ------------------------------------------------------------------ reserves
def reserve(conn, bank_id: str, currency_code: str, *, for_update: bool = False) -> dict:
    row = conn.execute(
        """
        INSERT INTO bank_reserves (bank_id, currency_code) VALUES (%s, %s)
        ON CONFLICT (bank_id, currency_code) DO NOTHING
        RETURNING bank_id, currency_code, vault, cb_deposit
        """,
        (bank_id, currency_code),
    ).fetchone()
    if row is None:
        sql = (
            "SELECT bank_id, currency_code, vault, cb_deposit FROM bank_reserves "
            "WHERE bank_id = %s AND currency_code = %s"
        )
        if for_update:
            sql += " FOR UPDATE"
        row = conn.execute(sql, (bank_id, currency_code)).fetchone()
    return row


def adjust_vault(conn, bank_id: str, currency_code: str, delta: Decimal) -> Decimal:
    """Upsert so the first movement on a fresh bank/currency pair works."""
    row = conn.execute(
        """
        INSERT INTO bank_reserves (bank_id, currency_code, vault)
        VALUES (%s, %s, %s)
        ON CONFLICT (bank_id, currency_code) DO UPDATE
           SET vault = bank_reserves.vault + EXCLUDED.vault, updated_at = now()
        RETURNING vault
        """,
        (bank_id, currency_code, delta),
    ).fetchone()
    return Decimal(row["vault"])


# ------------------------------------------------------------------ loans
def insert_loan(
    conn,
    *,
    bank_id: str,
    actor_id: str,
    currency_code: str,
    principal: Decimal,
    rate_bps: int,
    spread_bps: int,
    rate_type: str,
    due_at,
) -> dict:
    return conn.execute(
        """
        INSERT INTO bank_loans
               (bank_id, actor_id, currency_code, principal, outstanding,
                rate_type, rate_bps, spread_bps, due_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, bank_id, actor_id, currency_code, principal, outstanding,
                  accrued_interest, rate_bps, status, issued_at, due_at
        """,
        (bank_id, actor_id, currency_code, principal, principal, rate_type, rate_bps, spread_bps, due_at),
    ).fetchone()


def loan(conn, loan_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, bank_id, actor_id, currency_code, principal, outstanding, accrued_interest, "
        "rate_bps, status, issued_at, due_at FROM bank_loans WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (loan_id,)).fetchone()


def loans_of(conn, actor_id: str, *, status: str = "active") -> list[dict]:
    return conn.execute(
        """
        SELECT l.id, l.bank_id, b.code AS bank_code, l.currency_code, l.principal,
               l.outstanding, l.accrued_interest, l.rate_bps, l.status, l.issued_at, l.due_at
          FROM bank_loans l
          JOIN banks b ON b.id = l.bank_id
         WHERE l.actor_id = %s AND l.status = %s
         ORDER BY l.issued_at DESC
        """,
        (actor_id, status),
    ).fetchall()


def active_loans(conn, bank_id: str | None = None) -> list[dict]:
    if bank_id:
        return conn.execute(
            "SELECT id, bank_id, actor_id, currency_code, principal, outstanding, accrued_interest, "
            "rate_bps, due_at FROM bank_loans WHERE status = 'active' AND bank_id = %s",
            (bank_id,),
        ).fetchall()
    return conn.execute(
        "SELECT id, bank_id, actor_id, currency_code, principal, outstanding, accrued_interest, "
        "rate_bps, due_at FROM bank_loans WHERE status = 'active'"
    ).fetchall()


def apply_repayment(
    conn, loan_id: str, *, principal: Decimal, interest: Decimal, status: str
) -> dict:
    return conn.execute(
        """
        UPDATE bank_loans
           SET outstanding = outstanding - %s,
               accrued_interest = accrued_interest - %s,
               status = %s,
               last_accrual_at = now()
         WHERE id = %s
        RETURNING outstanding, accrued_interest, status
        """,
        (principal, interest, status, loan_id),
    ).fetchone()


def accrue(conn, loan_id: str, interest: Decimal) -> None:
    conn.execute(
        """
        UPDATE bank_loans
           SET accrued_interest = accrued_interest + %s, last_accrual_at = now()
         WHERE id = %s
        """,
        (interest, loan_id),
    )


# ------------------------------------------------------------------ rates
def latest_rates(conn) -> dict | None:
    return conn.execute(
        """
        SELECT policy_rate_bps, deposit_rate_bps, lend_rate_bps, effective_at, source
          FROM bank_rate_history ORDER BY effective_at DESC, id DESC LIMIT 1
        """
    ).fetchone()


def record_rates(conn, *, policy_bps: int, deposit_bps: int, lend_bps: int, source: str = "central_bank", note: str = "") -> dict:
    return conn.execute(
        """
        INSERT INTO bank_rate_history (policy_rate_bps, deposit_rate_bps, lend_rate_bps, source, note)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING policy_rate_bps, deposit_rate_bps, lend_rate_bps, effective_at
        """,
        (policy_bps, deposit_bps, lend_bps, source, note),
    ).fetchone()


def record_interest_run(
    conn, *, bank_id: str, run_date, deposit_interest: Decimal, loan_interest: Decimal
) -> dict:
    return conn.execute(
        """
        INSERT INTO bank_interest_runs (bank_id, run_date, deposit_interest, loan_interest)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (bank_id, run_date) DO UPDATE
           SET deposit_interest = EXCLUDED.deposit_interest,
               loan_interest = EXCLUDED.loan_interest
        RETURNING id, run_date
        """,
        (bank_id, run_date, deposit_interest, loan_interest),
    ).fetchone()


# ------------------------------------------------------------------ certificates
def insert_certificate(
    conn,
    *,
    bank_id: str,
    holder_actor_id: str,
    currency_code: str,
    principal: Decimal,
    rate_bps: int,
    term_days: int,
    matures_at,
) -> dict:
    return conn.execute(
        """
        INSERT INTO deposit_certificates
               (bank_id, holder_actor_id, currency_code, principal, rate_bps, term_days, matures_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, bank_id, holder_actor_id, currency_code, principal, accrued_interest,
                  rate_bps, term_days, transfer_count, status, issued_at, matures_at
        """,
        (bank_id, holder_actor_id, currency_code, principal, rate_bps, term_days, matures_at),
    ).fetchone()


def certificate(conn, certificate_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, bank_id, holder_actor_id, currency_code, principal, accrued_interest, "
        "rate_bps, term_days, transfer_count, status, issued_at, matures_at, redeemed_at "
        "FROM deposit_certificates WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (certificate_id,)).fetchone()


def certificates_of(conn, actor_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT c.id, c.bank_id, b.code AS bank_code, c.currency_code, c.principal,
               c.accrued_interest, c.rate_bps, c.term_days, c.status, c.matures_at
          FROM deposit_certificates c
          JOIN banks b ON b.id = c.bank_id
         WHERE c.holder_actor_id = %s AND c.status = 'active'
         ORDER BY c.matures_at
        """,
        (actor_id,),
    ).fetchall()


def active_certificates(conn, bank_id: str | None = None) -> list[dict]:
    if bank_id:
        return conn.execute(
            "SELECT id, bank_id, principal, accrued_interest, rate_bps, holder_actor_id "
            "FROM deposit_certificates WHERE status = 'active' AND bank_id = %s",
            (bank_id,),
        ).fetchall()
    return conn.execute(
        "SELECT id, bank_id, principal, accrued_interest, rate_bps, holder_actor_id "
        "FROM deposit_certificates WHERE status = 'active'"
    ).fetchall()


def accrue_certificate(conn, certificate_id: str, interest: Decimal) -> None:
    conn.execute(
        "UPDATE deposit_certificates SET accrued_interest = accrued_interest + %s WHERE id = %s",
        (interest, certificate_id),
    )


def transfer_certificate(conn, certificate_id: str, holder_actor_id: str) -> dict:
    return conn.execute(
        """
        UPDATE deposit_certificates
           SET holder_actor_id = %s, transfer_count = transfer_count + 1
         WHERE id = %s
        RETURNING id, holder_actor_id, transfer_count
        """,
        (holder_actor_id, certificate_id),
    ).fetchone()


def close_certificate(conn, certificate_id: str, status: str) -> None:
    conn.execute(
        "UPDATE deposit_certificates SET status = %s, redeemed_at = now() WHERE id = %s",
        (status, certificate_id),
    )


def insert_certificate_quote(
    conn, *, certificate_id: str, seller_actor_id: str, ask_yield_bps: int, price: Decimal
) -> dict:
    return conn.execute(
        """
        INSERT INTO deposit_certificate_quotes
               (certificate_id, seller_actor_id, ask_yield_bps, price, expires_at)
        VALUES (%s, %s, %s, %s, now() + interval '30 minutes')
        RETURNING id, certificate_id, seller_actor_id, ask_yield_bps, price, status, expires_at
        """,
        (certificate_id, seller_actor_id, ask_yield_bps, price),
    ).fetchone()


def certificate_quote(conn, quote_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT q.id, q.certificate_id, q.seller_actor_id, q.ask_yield_bps, q.price, q.status, "
        "q.expires_at, c.currency_code "
        "FROM deposit_certificate_quotes q "
        "JOIN deposit_certificates c ON c.id = q.certificate_id WHERE q.id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (quote_id,)).fetchone()


def fill_certificate_quote(conn, quote_id: str, buyer_actor_id: str) -> dict:
    return conn.execute(
        """
        UPDATE deposit_certificate_quotes
           SET status = 'filled', buyer_actor_id = %s, filled_at = now()
         WHERE id = %s
        RETURNING id, status, price
        """,
        (buyer_actor_id, quote_id),
    ).fetchone()


def certificate_quotes(conn, *, open_only: bool = True) -> list[dict]:
    where = "WHERE q.status = 'open' AND q.expires_at > now()" if open_only else ""
    return conn.execute(
        f"""
        SELECT q.id, q.certificate_id, q.seller_actor_id, q.ask_yield_bps, q.price, q.status,
               q.expires_at, c.currency_code, c.principal, c.accrued_interest, c.matures_at
          FROM deposit_certificate_quotes q
          JOIN deposit_certificates c ON c.id = q.certificate_id
          {where}
         ORDER BY q.quoted_at DESC
         LIMIT 50
        """
    ).fetchall()


# ------------------------------------------------------------------ interbank
def insert_interbank(
    conn,
    *,
    lender_bank_id: str,
    borrower_bank_id: str,
    currency_code: str,
    principal: Decimal,
    rate_bps: int,
    term_days: int,
) -> dict:
    return conn.execute(
        """
        INSERT INTO interbank_loans
               (lender_bank_id, borrower_bank_id, currency_code, principal, rate_bps, term_days)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, lender_bank_id, borrower_bank_id, currency_code, principal, rate_bps,
                  term_days, status, created_at, accepted_at, matures_at
        """,
        (lender_bank_id, borrower_bank_id, currency_code, principal, rate_bps, term_days),
    ).fetchone()


def interbank(conn, loan_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, lender_bank_id, borrower_bank_id, currency_code, principal, rate_bps, "
        "term_days, status, created_at, accepted_at, matures_at FROM interbank_loans WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (loan_id,)).fetchone()


def interbank_orders(conn, *, status: str | None = None) -> list[dict]:
    if status:
        return conn.execute(
            """
            SELECT i.id, i.currency_code, i.principal, i.rate_bps, i.term_days, i.status,
                   i.created_at, i.matures_at,
                   lb.code AS lender_code, bb.code AS borrower_code
              FROM interbank_loans i
              JOIN banks lb ON lb.id = i.lender_bank_id
              LEFT JOIN banks bb ON bb.id = i.borrower_bank_id
             WHERE i.status = %s
             ORDER BY i.created_at DESC LIMIT 100
            """,
            (status,),
        ).fetchall()
    return conn.execute(
        """
        SELECT i.id, i.currency_code, i.principal, i.rate_bps, i.term_days, i.status,
               i.created_at, i.matures_at, lb.code AS lender_code, bb.code AS borrower_code
          FROM interbank_loans i
          JOIN banks lb ON lb.id = i.lender_bank_id
          LEFT JOIN banks bb ON bb.id = i.borrower_bank_id
         ORDER BY i.created_at DESC LIMIT 100
        """
    ).fetchall()


def set_interbank_status(conn, loan_id: str, status: str, *, accepted: bool = False) -> dict:
    if accepted:
        sql = """
        UPDATE interbank_loans
           SET status = %s, accepted_at = now(),
               matures_at = now() + make_interval(days => term_days)
         WHERE id = %s
        RETURNING id, status, matures_at
        """
    else:
        sql = "UPDATE interbank_loans SET status = %s WHERE id = %s RETURNING id, status, matures_at"
    return conn.execute(sql, (status, loan_id)).fetchone()


# ------------------------------------------------------------------ insurance
def insurance_fund(conn, currency_code: str, *, for_update: bool = False) -> dict:
    row = conn.execute(
        """
        INSERT INTO deposit_insurance_fund (currency_code) VALUES (%s)
        ON CONFLICT (currency_code) DO NOTHING
        RETURNING id, currency_code, balance, per_actor_cap_q1_equiv
        """,
        (currency_code,),
    ).fetchone()
    if row is None:
        sql = (
            "SELECT id, currency_code, balance, per_actor_cap_q1_equiv FROM deposit_insurance_fund "
            "WHERE currency_code = %s"
        )
        if for_update:
            sql += " FOR UPDATE"
        row = conn.execute(sql, (currency_code,)).fetchone()
    return row


def adjust_insurance_fund(conn, fund_id: str, delta: Decimal) -> Decimal | None:
    row = conn.execute(
        """
        UPDATE deposit_insurance_fund SET balance = balance + %s, updated_at = now()
         WHERE id = %s AND balance + %s >= 0
        RETURNING balance
        """,
        (delta, fund_id, delta),
    ).fetchone()
    return Decimal(row["balance"]) if row else None


def insert_claim(
    conn, *, fund_id: str, bank_id: str, actor_id: str, claim_amount: Decimal, cap_applied: Decimal
) -> dict:
    return conn.execute(
        """
        INSERT INTO deposit_insurance_claims
               (fund_id, bank_id, actor_id, claim_amount, cap_applied)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, fund_id, bank_id, actor_id, claim_amount, cap_applied, approvals, status
        """,
        (fund_id, bank_id, actor_id, claim_amount, cap_applied),
    ).fetchone()


def claim(conn, claim_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, fund_id, bank_id, actor_id, claim_amount, cap_applied, approvals, status "
        "FROM deposit_insurance_claims WHERE id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (claim_id,)).fetchone()


def update_claim(conn, claim_id: str, *, approvals: list[str], status: str) -> dict:
    import json

    return conn.execute(
        """
        UPDATE deposit_insurance_claims
           SET approvals = %s::jsonb, status = %s,
               decided_at = CASE WHEN %s IN ('approved','paid','rejected') THEN now() ELSE decided_at END
         WHERE id = %s
        RETURNING id, status, approvals, cap_applied
        """,
        (json.dumps(approvals), status, status, claim_id),
    ).fetchone()


# ------------------------------------------------------------------ compliance
def compliance_fund(conn, currency_code: str, *, for_update: bool = False) -> dict:
    row = conn.execute(
        """
        INSERT INTO compliance_fund (currency_code) VALUES (%s)
        ON CONFLICT (currency_code) DO NOTHING
        RETURNING id, currency_code, balance
        """,
        (currency_code,),
    ).fetchone()
    if row is None:
        sql = "SELECT id, currency_code, balance FROM compliance_fund WHERE currency_code = %s"
        if for_update:
            sql += " FOR UPDATE"
        row = conn.execute(sql, (currency_code,)).fetchone()
    return row


def adjust_compliance_fund(conn, fund_id: str, delta: Decimal) -> Decimal | None:
    row = conn.execute(
        """
        UPDATE compliance_fund SET balance = balance + %s, updated_at = now()
         WHERE id = %s AND balance + %s >= 0
        RETURNING balance
        """,
        (delta, fund_id, delta),
    ).fetchone()
    return Decimal(row["balance"]) if row else None


def insert_compliance_entry(conn, *, fund_id: str, kind: str, amount: Decimal, ref_type: str, ref_id: str | None) -> None:
    conn.execute(
        """
        INSERT INTO compliance_fund_entries (fund_id, kind, amount, ref_type, ref_id)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (fund_id, kind, amount, ref_type, ref_id),
    )


def officer(conn, actor_id: str, *, for_update: bool = False) -> dict | None:
    sql = (
        "SELECT id, bank_id, actor_id, display_name, status FROM bank_officers WHERE actor_id = %s"
    )
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (actor_id,)).fetchone()


def insert_officer(conn, *, bank_id: str, actor_id: str, display_name: str) -> dict:
    return conn.execute(
        """
        INSERT INTO bank_officers (bank_id, actor_id, display_name)
        VALUES (%s, %s, %s)
        RETURNING id, bank_id, actor_id, display_name, status
        """,
        (bank_id, actor_id, display_name),
    ).fetchone()


def set_officer_status(conn, officer_id: str, status: str) -> None:
    conn.execute("UPDATE bank_officers SET status = %s WHERE id = %s", (status, officer_id))


def insert_bribe(
    conn,
    *,
    player_actor_id: str,
    officer_actor_id: str,
    currency_code: str,
    amount_src: Decimal,
    base_fee_q1: Decimal,
    bribe_q1: Decimal,
    audit_probability: float,
    status: str,
) -> dict:
    return conn.execute(
        """
        INSERT INTO bribe_events
               (player_actor_id, officer_actor_id, currency_code, amount_src, base_fee_q1,
                bribe_q1, audit_probability, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, status, bribe_q1, audit_probability, created_at
        """,
        (
            player_actor_id,
            officer_actor_id,
            currency_code,
            amount_src,
            base_fee_q1,
            bribe_q1,
            audit_probability,
            status,
        ),
    ).fetchone()
