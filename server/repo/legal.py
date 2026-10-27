"""Governance, court and insolvency persistence (08).

One module per design doc section: charters/officers/meetings/resolutions,
commercial courts, then insolvency. Pure SQL, no business rules.
"""

from __future__ import annotations

import json
from decimal import Decimal

# ------------------------------------------------------------------ charter
def charter(conn, company_id: str) -> dict | None:
    return conn.execute(
        "SELECT company_id, version, document, adopted_at, adopted_by "
        "FROM company_charters WHERE company_id = %s",
        (company_id,),
    ).fetchone()


def upsert_charter(conn, company_id: str, document: dict, adopted_by: str) -> dict:
    return conn.execute(
        """
        INSERT INTO company_charters (company_id, version, document, adopted_by)
        VALUES (%s, 1, %s::jsonb, %s)
        ON CONFLICT (company_id) DO UPDATE
           SET version = company_charters.version + 1,
               document = EXCLUDED.document,
               adopted_at = now(),
               adopted_by = EXCLUDED.adopted_by
        RETURNING company_id, version, document, adopted_at
        """,
        (company_id, json.dumps(document, default=str), adopted_by),
    ).fetchone()


# ------------------------------------------------------------------ officers
def officers_of(conn, company_id: str, *, status: str = "active") -> list[dict]:
    return conn.execute(
        """
        SELECT o.company_id, o.actor_id, o.role, o.appointed_at, o.term_until, o.status,
               a.display_name, a.code
          FROM company_officers o JOIN economic_actors a ON a.id = o.actor_id
         WHERE o.company_id = %s AND o.status = %s
         ORDER BY o.role, o.appointed_at
        """,
        (company_id, status),
    ).fetchall()


def officer(conn, company_id: str, actor_id: str, role: str) -> dict | None:
    return conn.execute(
        "SELECT company_id, actor_id, role, status FROM company_officers "
        "WHERE company_id = %s AND actor_id = %s AND role = %s",
        (company_id, actor_id, role),
    ).fetchone()


def appoint_officer(conn, company_id: str, actor_id: str, role: str, term_until=None) -> dict:
    return conn.execute(
        """
        INSERT INTO company_officers (company_id, actor_id, role, term_until)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (company_id, actor_id, role) DO UPDATE
           SET status = 'active', appointed_at = now(), term_until = EXCLUDED.term_until
        RETURNING company_id, actor_id, role, status, appointed_at
        """,
        (company_id, actor_id, role, term_until),
    ).fetchone()


def set_officer_status(conn, company_id: str, actor_id: str, role: str, status: str) -> None:
    conn.execute(
        "UPDATE company_officers SET status = %s "
        "WHERE company_id = %s AND actor_id = %s AND role = %s",
        (status, company_id, actor_id, role),
    )


def board_of(conn, company_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT b.company_id, b.seat_no, b.actor_id, b.elected_at, b.term_until, a.display_name
          FROM board_seats b LEFT JOIN economic_actors a ON a.id = b.actor_id
         WHERE b.company_id = %s ORDER BY b.seat_no
        """,
        (company_id,),
    ).fetchall()


def elect_seat(conn, company_id: str, seat_no: int, actor_id: str, term_until=None) -> dict:
    return conn.execute(
        """
        INSERT INTO board_seats (company_id, seat_no, actor_id, elected_at, term_until)
        VALUES (%s, %s, %s, now(), %s)
        ON CONFLICT (company_id, seat_no) DO UPDATE
           SET actor_id = EXCLUDED.actor_id, elected_at = now(),
               term_until = EXCLUDED.term_until
        RETURNING company_id, seat_no, actor_id, elected_at
        """,
        (company_id, seat_no, actor_id, term_until),
    ).fetchone()


# ------------------------------------------------------------------ meetings
def open_meeting(conn, company_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, company_id, kind, scheduled_at, record_at, status FROM shareholder_meetings "
        "WHERE company_id = %s AND status IN ('scheduled','open') "
        "ORDER BY created_at DESC LIMIT 1",
        (company_id,),
    ).fetchone()


def create_meeting(conn, company_id: str, kind: str = "extraordinary") -> dict:
    return conn.execute(
        """
        INSERT INTO shareholder_meetings (company_id, kind)
        VALUES (%s, %s)
        RETURNING id, company_id, kind, scheduled_at, record_at, status, created_at
        """,
        (company_id, kind),
    ).fetchone()


def meeting(conn, meeting_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, company_id, kind, scheduled_at, record_at, status "
        "FROM shareholder_meetings WHERE id = %s",
        (meeting_id,),
    ).fetchone()


def close_meeting(conn, meeting_id: str) -> None:
    conn.execute(
        "UPDATE shareholder_meetings SET status = 'closed' WHERE id = %s", (meeting_id,)
    )


# ------------------------------------------------------------------ resolutions
RESOLUTION_COLUMNS = (
    "id, meeting_id, company_id, kind, special, payload, yes, no, abstain, status, "
    "created_by, created_at, decided_at"
)


def insert_resolution(conn, *, meeting_id: str, company_id: str, kind: str, special: bool,
                      payload: dict, created_by: str) -> dict:
    return conn.execute(
        f"""
        INSERT INTO resolutions (meeting_id, company_id, kind, special, payload, created_by)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s)
        RETURNING {RESOLUTION_COLUMNS}
        """,
        (meeting_id, company_id, kind, special, json.dumps(payload, default=str), created_by),
    ).fetchone()


def resolution(conn, resolution_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {RESOLUTION_COLUMNS} FROM resolutions WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (resolution_id,)).fetchone()


def resolutions_of(conn, company_id: str, limit: int = 20) -> list[dict]:
    return conn.execute(
        f"SELECT {RESOLUTION_COLUMNS} FROM resolutions WHERE company_id = %s "
        "ORDER BY created_at DESC LIMIT %s",
        (company_id, limit),
    ).fetchall()


def upsert_vote(conn, resolution_id: str, actor_id: str, shares: int, choice: str) -> dict:
    return conn.execute(
        """
        INSERT INTO resolution_votes (resolution_id, actor_id, shares, choice)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (resolution_id, actor_id) DO UPDATE
           SET shares = EXCLUDED.shares, choice = EXCLUDED.choice, voted_at = now()
        RETURNING resolution_id, actor_id, shares, choice
        """,
        (resolution_id, actor_id, shares, choice),
    ).fetchone()


def votes_of(conn, resolution_id: str) -> list[dict]:
    return conn.execute(
        "SELECT v.actor_id, v.shares, v.choice, a.display_name FROM resolution_votes v "
        "JOIN economic_actors a ON a.id = v.actor_id "
        "WHERE v.resolution_id = %s ORDER BY v.shares DESC",
        (resolution_id,),
    ).fetchall()


def finish_resolution(conn, resolution_id: str, *, yes: int, no: int, abstain: int,
                      status: str) -> None:
    conn.execute(
        "UPDATE resolutions SET yes = %s, no = %s, abstain = %s, status = %s, "
        "decided_at = now() WHERE id = %s",
        (yes, no, abstain, status, resolution_id),
    )


def set_tally(conn, resolution_id: str, *, yes: int, no: int, abstain: int) -> None:
    conn.execute(
        "UPDATE resolutions SET yes = %s, no = %s, abstain = %s WHERE id = %s",
        (yes, no, abstain, resolution_id),
    )


def insert_related_party(conn, *, company_id: str, counterparty_actor_id: str, kind: str,
                         amount: Decimal) -> dict:
    return conn.execute(
        """
        INSERT INTO related_party_transactions (company_id, counterparty_actor_id, kind, amount)
        VALUES (%s, %s, %s, %s)
        RETURNING id, company_id, counterparty_actor_id, kind, amount, status, created_at
        """,
        (company_id, counterparty_actor_id, kind, amount),
    ).fetchone()


def related_party(conn, txn_id: str, *, for_update: bool = False) -> dict | None:
    sql = ("SELECT id, company_id, counterparty_actor_id, kind, amount, status, approved_by, "
           "created_at, decided_at FROM related_party_transactions WHERE id = %s")
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (txn_id,)).fetchone()


def related_parties(conn, company_id: str, limit: int = 20) -> list[dict]:
    return conn.execute(
        "SELECT id, company_id, counterparty_actor_id, kind, amount, status, created_at "
        "FROM related_party_transactions WHERE company_id = %s "
        "ORDER BY created_at DESC LIMIT %s",
        (company_id, limit),
    ).fetchall()


def set_related_party_status(conn, txn_id: str, status: str, approved_by: str | None) -> None:
    conn.execute(
        "UPDATE related_party_transactions SET status = %s, approved_by = %s, decided_at = now() "
        "WHERE id = %s",
        (status, approved_by, txn_id),
    )


# ------------------------------------------------------------------ courts
def courts(conn, *, level: str | None = None, sector: str | None = None) -> list[dict]:
    clauses, params = ["status = 'active'"], []
    if level:
        clauses.append("level = %s")
        params.append(level)
    if sector:
        clauses.append("jurisdiction_sector = %s")
        params.append(sector)
    return conn.execute(
        "SELECT id, code, name, jurisdiction_sector, level FROM commercial_courts "
        f"WHERE {' AND '.join(clauses)} ORDER BY level, code",
        params,
    ).fetchall()


def court_by_code(conn, code: str) -> dict | None:
    return conn.execute(
        "SELECT id, code, name, jurisdiction_sector, level FROM commercial_courts WHERE code = %s",
        (code,),
    ).fetchone()


def court_by_id(conn, court_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, code, name, jurisdiction_sector, level FROM commercial_courts WHERE id = %s",
        (court_id,),
    ).fetchone()


CASE_COLUMNS = (
    "id, court_id, kind, plaintiff_actor_id, defendant_actor_id, company_id, "
    "jurisdiction_sector, amount, currency_code, claim, filing_fee, status, "
    "filed_at, served_at, hearing_at, closed_at"
)


def insert_case(conn, *, court_id: str, kind: str, plaintiff_actor_id: str,
                defendant_actor_id: str, company_id: str | None, jurisdiction_sector: str,
                amount: Decimal, currency_code: str, claim: str, filing_fee: Decimal) -> dict:
    return conn.execute(
        f"""
        INSERT INTO court_cases (court_id, kind, plaintiff_actor_id, defendant_actor_id,
                                 company_id, jurisdiction_sector, amount, currency_code,
                                 claim, filing_fee)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING {CASE_COLUMNS}
        """,
        (court_id, kind, plaintiff_actor_id, defendant_actor_id, company_id,
         jurisdiction_sector, amount, currency_code, claim, filing_fee),
    ).fetchone()


def case_by_id(conn, case_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {CASE_COLUMNS} FROM court_cases WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (case_id,)).fetchone()


def cases_for(conn, actor_id: str, limit: int = 50) -> list[dict]:
    return conn.execute(
        f"SELECT {CASE_COLUMNS} FROM court_cases "
        "WHERE plaintiff_actor_id = %s OR defendant_actor_id = %s "
        "ORDER BY filed_at DESC LIMIT %s",
        (actor_id, actor_id, limit),
    ).fetchall()


def cases_ready_for_judgment(conn, limit: int = 100) -> list[dict]:
    return conn.execute(
        f"SELECT {CASE_COLUMNS} FROM court_cases c "
        "WHERE c.status IN ('served','hearing') AND c.hearing_at IS NOT NULL "
        "  AND c.hearing_at <= now() "
        "  AND NOT EXISTS (SELECT 1 FROM court_judgments j WHERE j.case_id = c.id) "
        "ORDER BY c.hearing_at LIMIT %s",
        (limit,),
    ).fetchall()


def set_case_status(conn, case_id: str, status: str, **fields) -> None:
    sets = ["status = %s"]
    params: list = [status]
    for key, value in fields.items():
        sets.append(f"{key} = %s")
        params.append(value)
    params.append(case_id)
    conn.execute(f"UPDATE court_cases SET {', '.join(sets)} WHERE id = %s", params)


def open_case_against(conn, defendant_actor_id: str) -> dict | None:
    """An insolvency case under stay blocks new suits against the debtor (08 §6.3)."""
    return conn.execute(
        """
        SELECT ic.id, ic.status FROM insolvency_cases ic
          JOIN companies c ON c.id = ic.company_id
         WHERE c.treasury_actor_id = %s
           AND ic.status IN ('filed','stay','administration','plan')
         LIMIT 1
        """,
        (defendant_actor_id,),
    ).fetchone()


def insert_evidence(conn, *, case_id: str, actor_id: str, side: str, summary: str,
                    payload: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO court_evidence (case_id, actor_id, side, summary, payload)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        RETURNING id, case_id, actor_id, side, summary, created_at
        """,
        (case_id, actor_id, side, summary, json.dumps(payload, default=str)),
    ).fetchone()


def evidence_of(conn, case_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, actor_id, side, summary, created_at FROM court_evidence "
        "WHERE case_id = %s ORDER BY created_at",
        (case_id,),
    ).fetchall()


def insert_hearing(conn, case_id: str, scheduled_at) -> dict:
    return conn.execute(
        """
        INSERT INTO court_hearings (case_id, scheduled_at)
        VALUES (%s, %s)
        RETURNING id, case_id, scheduled_at, status
        """,
        (case_id, scheduled_at),
    ).fetchone()


def hearings_of(conn, case_id: str) -> list[dict]:
    return conn.execute(
        "SELECT id, scheduled_at, judge_actor_id, status FROM court_hearings "
        "WHERE case_id = %s ORDER BY scheduled_at",
        (case_id,),
    ).fetchall()


def insert_judgment(conn, case_id: str, judgment: dict, remedy: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO court_judgments (case_id, judgment, remedy)
        VALUES (%s, %s::jsonb, %s::jsonb)
        RETURNING id, case_id, judgment, remedy, status, issued_at
        """,
        (case_id, json.dumps(judgment, default=str), json.dumps(remedy, default=str)),
    ).fetchone()


def judgment_of_case(conn, case_id: str, *, for_update: bool = False) -> dict | None:
    sql = ("SELECT id, case_id, judgment, remedy, status, issued_at, enforced_at "
           "FROM court_judgments WHERE case_id = %s")
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (case_id,)).fetchone()


def set_judgment_status(conn, judgment_id: str, status: str, *, enforced: bool = False) -> None:
    conn.execute(
        "UPDATE court_judgments SET status = %s"
        + (", enforced_at = now()" if enforced else "")
        + " WHERE id = %s",
        (status, judgment_id),
    )


def insert_appeal(conn, *, case_id: str, judgment_id: str, appellant_actor_id: str) -> dict:
    return conn.execute(
        """
        INSERT INTO court_appeals (case_id, judgment_id, appellant_actor_id)
        VALUES (%s, %s, %s)
        RETURNING id, case_id, judgment_id, appellant_actor_id, status, filed_at
        """,
        (case_id, judgment_id, appellant_actor_id),
    ).fetchone()


def appeal_of_case(conn, case_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, case_id, judgment_id, appellant_actor_id, status, filed_at, decided_at, "
        "outcome FROM court_appeals WHERE case_id = %s ORDER BY filed_at DESC LIMIT 1",
        (case_id,),
    ).fetchone()


def decide_appeal(conn, appeal_id: str, status: str, outcome: dict) -> None:
    conn.execute(
        "UPDATE court_appeals SET status = %s, outcome = %s::jsonb, decided_at = now() "
        "WHERE id = %s",
        (status, json.dumps(outcome, default=str), appeal_id),
    )


def insert_freeze(conn, *, case_id: str, asset_kind: str, asset_id: str) -> dict | None:
    return conn.execute(
        """
        INSERT INTO asset_freezes (case_id, asset_kind, asset_id)
        VALUES (%s, %s, %s)
        ON CONFLICT (case_id, asset_kind, asset_id) DO NOTHING
        RETURNING case_id, asset_kind, asset_id, status, created_at
        """,
        (case_id, asset_kind, asset_id),
    ).fetchone()


def freezes_of_case(conn, case_id: str) -> list[dict]:
    return conn.execute(
        "SELECT case_id, asset_kind, asset_id, status, created_at, released_at "
        "FROM asset_freezes WHERE case_id = %s ORDER BY created_at",
        (case_id,),
    ).fetchall()


def active_freeze(conn, asset_kind: str, asset_id: str) -> dict | None:
    return conn.execute(
        "SELECT case_id, asset_kind, asset_id, status FROM asset_freezes "
        "WHERE asset_kind = %s AND asset_id = %s AND status = 'active' LIMIT 1",
        (asset_kind, asset_id),
    ).fetchone()


def release_freeze(conn, case_id: str, asset_kind: str, asset_id: str, status: str = "released") -> None:
    conn.execute(
        "UPDATE asset_freezes SET status = %s, released_at = now() "
        "WHERE case_id = %s AND asset_kind = %s AND asset_id = %s",
        (status, case_id, asset_kind, asset_id),
    )


# ------------------------------------------------------------------ insolvency
INSOLVENCY_COLUMNS = (
    "id, company_id, bank_id, court_id, kind, status, administrator_actor_id, "
    "filed_by_actor_id, reason, automatic_stay_until, filed_at, closed_at"
)


def insert_insolvency(conn, *, company_id: str, court_id: str, kind: str,
                      administrator_actor_id: str, filed_by_actor_id: str, reason: str,
                      stay_until) -> dict:
    return conn.execute(
        f"""
        INSERT INTO insolvency_cases (company_id, court_id, kind, administrator_actor_id,
                                      filed_by_actor_id, reason, automatic_stay_until)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING {INSOLVENCY_COLUMNS}
        """,
        (company_id, court_id, kind, administrator_actor_id, filed_by_actor_id, reason,
         stay_until),
    ).fetchone()


def insolvency_by_id(conn, case_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {INSOLVENCY_COLUMNS} FROM insolvency_cases WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (case_id,)).fetchone()


def open_insolvency_for(conn, company_id: str) -> dict | None:
    return conn.execute(
        f"SELECT {INSOLVENCY_COLUMNS} FROM insolvency_cases WHERE company_id = %s "
        "AND status IN ('filed','stay','administration','plan','liquidation') "
        "ORDER BY filed_at DESC LIMIT 1",
        (company_id,),
    ).fetchone()


def set_insolvency_status(conn, case_id: str, status: str, *, closed: bool = False) -> None:
    conn.execute(
        "UPDATE insolvency_cases SET status = %s" + (", closed_at = now()" if closed else "")
        + " WHERE id = %s",
        (status, case_id),
    )


def insert_claim(conn, *, case_id: str, claimant_actor_id: str, kind: str,
                 amount: Decimal) -> dict:
    return conn.execute(
        """
        INSERT INTO insolvency_claims (case_id, claimant_actor_id, kind, amount)
        VALUES (%s, %s, %s, %s)
        RETURNING id, case_id, claimant_actor_id, kind, amount, paid, status
        """,
        (case_id, claimant_actor_id, kind, amount),
    ).fetchone()


def claims_of(conn, case_id: str, *, status: str | None = None) -> list[dict]:
    if status:
        return conn.execute(
            "SELECT id, case_id, claimant_actor_id, kind, amount, paid, status "
            "FROM insolvency_claims WHERE case_id = %s AND status = %s "
            "ORDER BY amount DESC",
            (case_id, status),
        ).fetchall()
    return conn.execute(
        "SELECT id, case_id, claimant_actor_id, kind, amount, paid, status "
        "FROM insolvency_claims WHERE case_id = %s ORDER BY amount DESC",
        (case_id,),
    ).fetchall()


def admit_claim(conn, claim_id: str) -> None:
    conn.execute("UPDATE insolvency_claims SET status = 'admitted' WHERE id = %s", (claim_id,))


def pay_claim(conn, claim_id: str, amount: Decimal, *, fully: bool) -> None:
    conn.execute(
        "UPDATE insolvency_claims SET paid = paid + %s, status = %s WHERE id = %s",
        (amount, "paid" if fully else "admitted", claim_id),
    )


def insert_plan(conn, case_id: str, document: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO restructuring_plans (case_id, document, status)
        VALUES (%s, %s::jsonb, 'voting')
        RETURNING id, case_id, document, status, created_at
        """,
        (case_id, json.dumps(document, default=str)),
    ).fetchone()


def plan_by_id(conn, plan_id: str, *, for_update: bool = False) -> dict | None:
    sql = "SELECT id, case_id, document, status, confirmed_at FROM restructuring_plans WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (plan_id,)).fetchone()


def plan_by_case(conn, case_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, case_id, document, status, confirmed_at FROM restructuring_plans "
        "WHERE case_id = %s ORDER BY created_at DESC LIMIT 1",
        (case_id,),
    ).fetchone()


def upsert_plan_vote(conn, plan_id: str, cls: str, choice: str, amount: Decimal) -> None:
    column_amount = "yes_amount" if choice == "yes" else "no_amount"
    column_count = "yes_count" if choice == "yes" else "no_count"
    conn.execute(
        f"""
        INSERT INTO plan_votes (plan_id, class, {column_amount}, {column_count})
        VALUES (%s, %s, %s, 1)
        ON CONFLICT (plan_id, class) DO UPDATE
           SET {column_amount} = plan_votes.{column_amount} + EXCLUDED.{column_amount},
               {column_count} = plan_votes.{column_count} + 1
        """,
        (plan_id, cls, amount),
    )


def plan_votes_of(conn, plan_id: str) -> list[dict]:
    return conn.execute(
        "SELECT plan_id, class, yes_amount, no_amount, yes_count, no_count "
        "FROM plan_votes WHERE plan_id = %s ORDER BY class",
        (plan_id,),
    ).fetchall()


def set_plan_status(conn, plan_id: str, status: str, *, confirmed: bool = False) -> None:
    conn.execute(
        "UPDATE restructuring_plans SET status = %s"
        + (", confirmed_at = now()" if confirmed else "")
        + " WHERE id = %s",
        (status, plan_id),
    )


def insert_asset_sale(conn, *, case_id: str, asset_kind: str, asset_id: str, method: str,
                      price: Decimal, status: str = "sold") -> dict:
    return conn.execute(
        """
        INSERT INTO asset_sales (case_id, asset_kind, asset_id, method, price, status)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, case_id, asset_kind, asset_id, method, price, status
        """,
        (case_id, asset_kind, asset_id, method, price, status),
    ).fetchone()


# ------------------------------------------------------------------ recognition
RECOGNITION_COLUMNS = (
    "id, judgment_id, case_id, region, status, reason_code, reason, requested_by, "
    "decided_by, decided_at, created_at"
)


def insert_recognition(conn, *, judgment_id: str, case_id: str, region: str,
                       requested_by: str) -> dict | None:
    return conn.execute(
        f"""
        INSERT INTO court_recognition (judgment_id, case_id, region, requested_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (judgment_id, region) DO NOTHING
        RETURNING {RECOGNITION_COLUMNS}
        """,
        (judgment_id, case_id, region, requested_by),
    ).fetchone()


def recognition_by_id(conn, recognition_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {RECOGNITION_COLUMNS} FROM court_recognition WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (recognition_id,)).fetchone()


def recognition_for(conn, judgment_id: str, region: str) -> dict | None:
    return conn.execute(
        f"SELECT {RECOGNITION_COLUMNS} FROM court_recognition "
        "WHERE judgment_id = %s AND region = %s",
        (judgment_id, region),
    ).fetchone()


def recognitions_of_case(conn, case_id: str) -> list[dict]:
    return conn.execute(
        f"SELECT {RECOGNITION_COLUMNS} FROM court_recognition "
        "WHERE case_id = %s ORDER BY created_at DESC",
        (case_id,),
    ).fetchall()


def decide_recognition(conn, recognition_id: str, *, status: str, reason_code: str | None,
                       reason: str, decided_by: str) -> None:
    conn.execute(
        "UPDATE court_recognition SET status = %s, reason_code = %s, reason = %s, "
        "decided_by = %s, decided_at = now() WHERE id = %s",
        (status, reason_code, reason, decided_by, recognition_id),
    )


def judgment_by_id(conn, judgment_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, case_id, judgment, remedy, status, issued_at, enforced_at "
        "FROM court_judgments WHERE id = %s",
        (judgment_id,),
    ).fetchone()
