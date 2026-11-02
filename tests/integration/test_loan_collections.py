"""Loan delinquency ladder (T-13 step 1).

The job moves a loan one step per run: ``active`` → ``overdue`` at the due date,
``overdue`` → ``defaulted`` after a 7-day grace. It never jumps two steps and it
never touches a repaid loan. The tests seed rows directly because the point under
test is the *clock*, not the borrowing API.
"""

from __future__ import annotations

import uuid

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service, loan_collections
from server.infra.context import db
from tests.helpers import guest


def _seed(dsn: str, player_id: str, *, status: str, due_offset_days: int) -> str:
    """Create a bank + one loan; returns the loan id."""
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_service.actor_for_player(conn, {"id": player_id})
        bank_id = conn.execute(
            "INSERT INTO banks (code, name, actor_id, currency_code) VALUES (%s, '测试行', %s, 'cc1') RETURNING id",
            (f"bk-{uuid.uuid4().hex[:10]}", str(actor["id"])),
        ).fetchone()["id"]
        loan = conn.execute(
            """
            INSERT INTO bank_loans (bank_id, actor_id, currency_code, principal, outstanding, rate_bps, status, due_at)
            VALUES (%s, %s, 'cc1', 1000, 1000, 500, %s, now() + make_interval(days => %s))
            RETURNING id
            """,
            (bank_id, str(actor["id"]), status, due_offset_days),
        ).fetchone()
    return str(loan["id"])


def _status(dsn: str, loan_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute("SELECT status FROM bank_loans WHERE id = %s", (loan_id,)).fetchone()["status"]


def _run(app):
    with app.app_context():
        with db().transaction() as conn:
            return loan_collections.overdue_tick(conn)


def test_active_loan_becomes_overdue_at_due_date(app, client, test_dsn):
    data = guest(client)
    loan_id = _seed(test_dsn, data["player"]["id"], status="active", due_offset_days=-1)

    result = _run(app)
    assert result["overdue"] == 1 and result["defaulted"] == 0
    assert _status(test_dsn, loan_id) == "overdue"


def test_overdue_loan_defaults_after_seven_day_grace(app, client, test_dsn):
    data = guest(client)
    loan_id = _seed(test_dsn, data["player"]["id"], status="overdue", due_offset_days=-8)

    result = _run(app)
    assert result["defaulted"] == 1
    assert _status(test_dsn, loan_id) == "defaulted"


def test_grace_period_not_elapsed_stays_overdue(app, client, test_dsn):
    data = guest(client)
    loan_id = _seed(test_dsn, data["player"]["id"], status="overdue", due_offset_days=-3)

    result = _run(app)
    assert result["defaulted"] == 0
    assert _status(test_dsn, loan_id) == "overdue"


def test_never_jumps_two_steps(app, client, test_dsn):
    data = guest(client)
    # A loan 10 days past due but still 'active' → only becomes overdue this run.
    loan_id = _seed(test_dsn, data["player"]["id"], status="active", due_offset_days=-10)

    result = _run(app)
    assert result["overdue"] == 1 and result["defaulted"] == 0
    assert _status(test_dsn, loan_id) == "overdue"


def test_repaid_loans_are_never_touched(app, client, test_dsn):
    data = guest(client)
    loan_id = _seed(test_dsn, data["player"]["id"], status="repaid", due_offset_days=-30)

    result = _run(app)
    assert result["overdue"] == 0 and result["defaulted"] == 0
    assert _status(test_dsn, loan_id) == "repaid"


def test_events_are_published(app, client, test_dsn):
    data = guest(client)
    loan_id = _seed(test_dsn, data["player"]["id"], status="active", due_offset_days=-1)

    _run(app)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT type, aggregate FROM domain_events WHERE type = 'loan.overdue' ORDER BY seq DESC LIMIT 1"
        ).fetchone()
    assert row is not None and str(row["aggregate"]) == loan_id


def test_job_entry_point_is_exported(app, test_dsn):
    from server.jobs import tasks

    assert callable(tasks.loan_overdue_tick)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        result = tasks.loan_overdue_tick(conn)
    assert result["overdue"] == 0 and result["defaulted"] == 0
