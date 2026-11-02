"""Court, insolvency, recognition and panel persistence (08).

Governance tables (charter / officers / board / meetings / resolutions /
related-party) used to live here too; they moved to ``repo/company_governance.py``
because they are owned by the commerce module. This file must not write them.

Pure SQL, no business rules.
"""

from __future__ import annotations

import json
from decimal import Decimal


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
            "SELECT id, case_id, claimant_actor_id, kind, amount, paid, paid_q1, status "
            "FROM insolvency_claims WHERE case_id = %s AND status = %s "
            "ORDER BY amount DESC",
            (case_id, status),
        ).fetchall()
    return conn.execute(
        "SELECT id, case_id, claimant_actor_id, kind, amount, paid, paid_q1, status "
        "FROM insolvency_claims WHERE case_id = %s ORDER BY amount DESC",
        (case_id,),
    ).fetchall()


def admit_claim(conn, claim_id: str) -> None:
    conn.execute("UPDATE insolvency_claims SET status = 'admitted' WHERE id = %s", (claim_id,))


def pay_claim_q1(conn, claim_id: str, *, paid_q1: Decimal, paid: Decimal,
                 fully: bool) -> None:
    conn.execute(
        "UPDATE insolvency_claims SET paid = %s, paid_q1 = %s, status = %s WHERE id = %s",
        (paid, paid_q1, "paid" if fully else "admitted", claim_id),
    )


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
    "decided_by, decided_at, created_at, dt_tx_id, conflict_with"
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


def set_recognition_dt(conn, recognition_id: str, tx_id: str) -> None:
    conn.execute(
        "UPDATE court_recognition SET dt_tx_id = %s WHERE id = %s", (tx_id, recognition_id)
    )


def set_recognition_conflict(conn, recognition_id: str, other_id: str) -> None:
    conn.execute(
        "UPDATE court_recognition SET conflict_with = %s WHERE id = %s",
        (other_id, recognition_id),
    )


def conflicting_recognition(conn, judgment_id: str, region: str) -> dict | None:
    """A contradictory verdict between the same pair already recognized here."""
    return conn.execute(
        """
        WITH target AS (
          SELECT c.plaintiff_actor_id, c.defendant_actor_id,
                 j.judgment->>'verdict' AS verdict
            FROM court_cases c JOIN court_judgments j ON j.case_id = c.id
           WHERE j.id = %s
        )
        SELECT r.id, r.judgment_id, r.case_id
          FROM court_recognition r
          JOIN court_judgments j2 ON j2.id = r.judgment_id
          JOIN court_cases c2 ON c2.id = j2.case_id
          CROSS JOIN target t
         WHERE r.region = %s
           AND r.status = 'recognized'
           AND r.judgment_id <> %s
           AND c2.plaintiff_actor_id = t.plaintiff_actor_id
           AND c2.defendant_actor_id = t.defendant_actor_id
           AND COALESCE(j2.judgment->>'verdict', '') <> COALESCE(t.verdict, '')
         ORDER BY r.decided_at DESC
         LIMIT 1
        """,
        (judgment_id, region, judgment_id),
    ).fetchone()


# ------------------------------------------------------------------ panels
PANEL_COLUMNS = "id, case_id, appeal_id, status, verdict, dissent, created_at, decided_at"


def insert_panel(conn, *, case_id: str, appeal_id: str | None) -> dict:
    return conn.execute(
        f"""
        INSERT INTO court_panels (case_id, appeal_id)
        VALUES (%s, %s)
        RETURNING {PANEL_COLUMNS}
        """,
        (case_id, appeal_id),
    ).fetchone()


def panel_by_id(conn, panel_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {PANEL_COLUMNS} FROM court_panels WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (panel_id,)).fetchone()


def panel_of_case(conn, case_id: str) -> dict | None:
    return conn.execute(
        f"SELECT {PANEL_COLUMNS} FROM court_panels WHERE case_id = %s "
        "ORDER BY created_at DESC LIMIT 1",
        (case_id,),
    ).fetchone()


def insert_panel_member(conn, *, panel_id: str, actor_id: str, slot: int, role: str,
                        status: str) -> None:
    conn.execute(
        """
        INSERT INTO court_panel_members (panel_id, actor_id, slot, role, status)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (panel_id, actor_id) DO NOTHING
        """,
        (panel_id, actor_id, slot, role, status),
    )


def panel_members(conn, panel_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT m.panel_id, m.actor_id, m.slot, m.role, m.status, m.vote, m.reason,
               m.voted_at, a.code, a.display_name, p.controller
          FROM court_panel_members m
          JOIN economic_actors a ON a.id = m.actor_id
          LEFT JOIN players p ON p.id = a.player_id
         WHERE m.panel_id = %s
         ORDER BY m.slot
        """,
        (panel_id,),
    ).fetchall()


def set_panel_member(conn, panel_id: str, actor_id: str, *, status: str,
                     role: str | None = None, vote: str | None = None,
                     reason: str | None = None) -> None:
    sets = ["status = %s"]
    params: list = [status]
    if role is not None:
        sets.append("role = %s")
        params.append(role)
    if vote is not None:
        sets.append("vote = %s")
        params.append(vote)
    if reason is not None:
        sets.append("reason = %s")
        params.append(reason)
    if status == "voted":
        sets.append("voted_at = now()")
    params.extend([panel_id, actor_id])
    conn.execute(
        f"UPDATE court_panel_members SET {', '.join(sets)} "
        "WHERE panel_id = %s AND actor_id = %s",
        params,
    )


def finish_panel(conn, panel_id: str, *, verdict: str, dissent: list[dict]) -> None:
    conn.execute(
        "UPDATE court_panels SET status = 'decided', verdict = %s, dissent = %s::jsonb, "
        "decided_at = now() WHERE id = %s",
        (verdict, json.dumps(dissent, default=str), panel_id),
    )
