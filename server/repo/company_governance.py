"""Company governance persistence: charter, officers, board, meetings, resolutions (08 §2/§3).

Split out of ``repo/legal.py``: these tables belong to the **commerce** module, and
a court module must not be the one writing a company charter. ``legal.py`` keeps
courts, insolvency, recognition and panels only.

Pure SQL, no business rules.
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


