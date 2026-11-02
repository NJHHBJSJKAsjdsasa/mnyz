"""Floating-rate repricing (T-12) and licence renewal (T-15b).

Both are clock jobs whose only output is a change to an existing row plus (for
the licence) one ledger entry, so the tests seed the rows and run the job.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import bank_service, licensing
from server.infra.context import db
from server.jobs import tasks
from server.repo import banks as bank_repo
from server.repo import currency as currency_repo
from tests.helpers import guest


def _actor(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    return str(actor["id"])


def _fund(dsn: str, actor_id: str, code: str, amount: str) -> None:
    from server.domain import currency_service
    from server.domain.currency_service import Move

    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, currency_service.TREASURY)
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[Move(treasury["id"], code, -Decimal(amount)), Move(actor_id, code, Decimal(amount))],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


# ------------------------------------------------------------------ rates


def _loan(dsn: str, *, actor_id: str, rate_type: str, issued_days: int, due_days: int,
          rate_bps: int, reset_due: bool) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        bank = bank_repo.create(conn, code=f"rate-bank-{uuid.uuid4().hex[:6]}", name="重定价行")
        row = conn.execute(
            """
            INSERT INTO bank_loans
                   (bank_id, actor_id, currency_code, principal, outstanding, rate_bps,
                    spread_bps, rate_type, status, issued_at, due_at, next_reset_at)
            VALUES (%s, %s, 'cc1', 1000, 1000, %s, 250, %s, 'active',
                    now() - make_interval(days => %s), now() + make_interval(days => %s),
                    CASE WHEN %s THEN now() - interval '1 day' ELSE NULL END)
            RETURNING id
            """,
            (str(bank["id"]), actor_id, rate_bps, rate_type, issued_days, due_days, reset_due),
        ).fetchone()
    return str(row["id"])


def _loan_row(dsn: str, loan_id: str) -> dict:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT rate_bps, next_reset_at, rate_type FROM bank_loans WHERE id = %s",
            (loan_id,),
        ).fetchone()


def test_floating_loan_is_repriced_against_the_policy_rate(app, client, test_dsn):
    player = guest(client, device_id="rate-device-1")
    actor_id = _actor(test_dsn, player["player"]["id"])
    loan_id = _loan(test_dsn, actor_id=actor_id, rate_type="floating", issued_days=30,
                    due_days=60, rate_bps=9999, reset_due=True)

    with app.app_context():
        with db().transaction() as conn:
            result = tasks.bank_rate_reset_tick(conn)

    assert result["reset"] == 1
    row = _loan_row(test_dsn, loan_id)
    # policy + spread(250) + premium for a ~90 day contract (250)
    assert int(row["rate_bps"]) == result["policy_rate_bps"] + 500
    assert row["next_reset_at"] is not None


def test_fixed_rate_and_fresh_resets_are_untouched(app, client, test_dsn):
    player = guest(client, device_id="rate-device-2")
    actor_id = _actor(test_dsn, player["player"]["id"])
    fixed_id = _loan(test_dsn, actor_id=actor_id, rate_type="fixed", issued_days=10,
                     due_days=80, rate_bps=777, reset_due=True)
    fresh_id = _loan(test_dsn, actor_id=actor_id, rate_type="floating", issued_days=10,
                     due_days=80, rate_bps=888, reset_due=False)

    with app.app_context():
        with db().transaction() as conn:
            conn.execute("UPDATE bank_loans SET next_reset_at = now() + interval '10 days' WHERE id = %s", (fresh_id,))
            result = bank_service.reset_floating_rates(conn)

    assert result["reset"] == 0
    assert int(_loan_row(test_dsn, fixed_id)["rate_bps"]) == 777
    assert int(_loan_row(test_dsn, fresh_id)["rate_bps"]) == 888


# --------------------------------------------------------------- licences


def _licence(dsn: str, *, actor_id: str, fee: str, expires_days: int = -1, status: str = "active") -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            INSERT INTO commerce_licenses (actor_id, kind, status, fee_currency, monthly_fee, expires_at)
            VALUES (%s, 'property_broker', %s, 'cc3', %s, now() + make_interval(days => %s))
            RETURNING id
            """,
            (actor_id, status, Decimal(fee), expires_days),
        ).fetchone()
    return str(row["id"])


def _licence_row(dsn: str, license_id: str) -> dict:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT status, monthly_fee, expires_at FROM commerce_licenses WHERE id = %s",
            (license_id,),
        ).fetchone()


def test_due_licence_is_charged_and_extended(app, client, test_dsn):
    player = guest(client, device_id="licence-device-1")
    actor_id = _actor(test_dsn, player["player"]["id"])
    _fund(test_dsn, actor_id, "cc3", "500")
    license_id = _licence(test_dsn, actor_id=actor_id, fee="200")

    with app.app_context():
        with db().transaction() as conn:
            result = tasks.licence_renewal_tick(conn)

    assert result["renewed"] == 1 and result["suspended"] == 0
    assert result["charged"] == "200.0000"
    row = _licence_row(test_dsn, license_id)
    assert row["status"] == "active"
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        balance = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = 'cc3'",
            (actor_id,),
        ).fetchone()["balance"]
        days = conn.execute(
            "SELECT EXTRACT(DAY FROM (expires_at - now())) AS days FROM commerce_licenses WHERE id = %s",
            (license_id,),
        ).fetchone()["days"]
    assert Decimal(balance) == Decimal("300.0000")
    assert 28 <= float(days) <= 30


def test_licence_without_cash_is_suspended_not_revoked(app, client, test_dsn):
    player = guest(client, device_id="licence-device-2")
    actor_id = _actor(test_dsn, player["player"]["id"])
    license_id = _licence(test_dsn, actor_id=actor_id, fee="200")

    with app.app_context():
        with db().transaction() as conn:
            result = licensing.renew_due(conn)

    assert result["suspended"] == 1 and result["renewed"] == 0
    assert _licence_row(test_dsn, license_id)["status"] == "suspended"


def test_licence_not_yet_due_is_left_alone(app, client, test_dsn):
    player = guest(client, device_id="licence-device-3")
    actor_id = _actor(test_dsn, player["player"]["id"])
    _fund(test_dsn, actor_id, "cc3", "500")
    license_id = _licence(test_dsn, actor_id=actor_id, fee="200", expires_days=20)

    with app.app_context():
        with db().transaction() as conn:
            result = licensing.renew_due(conn)

    assert result["renewed"] == 0
    assert _licence_row(test_dsn, license_id)["status"] == "active"
