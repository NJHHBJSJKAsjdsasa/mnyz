"""Investor protection fund: claims, review, cap and payouts (T-23)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from tests.helpers import bearer
from tests.integration.test_ai_economy import _make_admin, _player


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _fund(dsn: str, amount: str, code: str = "cc4") -> None:
    """Top the protection fund up from the (negative-allowed) system treasury."""
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        fund = currency_service.system_actor(conn, "insurance_fund")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[
                Move(str(treasury["id"]), code, -Decimal(amount)),
                Move(str(fund["id"]), code, Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _fund_balance(dsn: str, code: str = "cc4") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        fund = currency_service.system_actor(conn, "insurance_fund")
        row = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = %s",
            (str(fund["id"]), code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _balance(dsn: str, player_id: str, code: str = "cc4") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT a.balance FROM currency_accounts a "
            "  JOIN economic_actors e ON e.id = a.actor_id "
            " WHERE e.player_id = %s AND a.currency_code = %s",
            (player_id, code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _admin(client, dsn: str, device: str) -> dict:
    player = _player(client, device)
    _make_admin(dsn, player["id"])
    return player


def _claim(client, token: str, *, amount: str, kind: str = "firm_default",
           reason: str = "券商挪用保证金"):
    return client.post(
        "/api/v1/market/protection/claims",
        json={"kind": kind, "amount": amount, "reason": reason},
        headers=_headers(token),
    )


def test_claim_then_approve_pays_out_of_the_fund(client, test_dsn):
    _fund(test_dsn, "5000")
    admin = _admin(client, test_dsn, "prot-admin-1")
    victim = _player(client, "prot-victim-1")
    fund_before = _fund_balance(test_dsn)
    balance_before = _balance(test_dsn, victim["id"])

    filed = _claim(client, victim["token"], amount="800")
    assert filed.status_code == 200, filed.get_data(as_text=True)
    claim = filed.get_json()["data"]
    assert claim["status"] == "pending"
    assert claim["claimed_amount"] == "800.0000"

    decided = client.post(
        f"/api/v1/admin/market/protection/claims/{claim['claim_id']}/decide",
        json={"approve": True, "note": "核实属实"},
        headers=_headers(admin["token"]),
    )
    assert decided.status_code == 200, decided.get_data(as_text=True)
    paid = decided.get_json()["data"]
    assert paid["status"] == "approved"
    assert paid["paid"] == "800.0000"
    assert paid["tx_id"]

    assert _balance(test_dsn, victim["id"]) - balance_before == Decimal("800")
    assert fund_before - _fund_balance(test_dsn) == Decimal("800")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        audit = conn.execute(
            "SELECT action FROM audit_log WHERE action = 'protection.pay'"
        ).fetchall()
    assert len(audit) == 1


def test_payout_is_capped_and_the_shortfall_is_visible(client, test_dsn):
    _fund(test_dsn, "50000")
    admin = _admin(client, test_dsn, "prot-admin-2")
    victim = _player(client, "prot-victim-2")
    claim = _claim(client, victim["token"], amount="25000").get_json()["data"]

    paid = client.post(
        f"/api/v1/admin/market/protection/claims/{claim['claim_id']}/decide",
        json={"approve": True},
        headers=_headers(admin["token"]),
    ).get_json()["data"]
    # Approving is not capped, paying is: the case keeps the full claim on record.
    assert paid["status"] == "partial"
    assert paid["claimed_amount"] == "25000.0000"
    assert paid["paid"] == "10000.0000"


def test_an_empty_fund_pays_nothing_and_says_so(client, test_dsn):
    admin = _admin(client, test_dsn, "prot-admin-3")
    victim = _player(client, "prot-victim-3")
    claim = _claim(client, victim["token"], amount="100").get_json()["data"]
    assert _fund_balance(test_dsn) == Decimal(0)

    paid = client.post(
        f"/api/v1/admin/market/protection/claims/{claim['claim_id']}/decide",
        json={"approve": True, "note": "基金已枯竭"},
        headers=_headers(admin["token"]),
    ).get_json()["data"]
    assert paid["paid"] == "0.0000"
    assert paid["status"] == "rejected"
    assert _balance(test_dsn, victim["id"]) == Decimal(0)


def test_rejects_pay_nothing_and_a_second_open_claim_is_refused(client, test_dsn):
    admin = _admin(client, test_dsn, "prot-admin-4")
    victim = _player(client, "prot-victim-4")
    first = _claim(client, victim["token"], amount="100").get_json()["data"]

    duplicate = _claim(client, victim["token"], amount="200")
    assert duplicate.status_code == 409

    rejected = client.post(
        f"/api/v1/admin/market/protection/claims/{first['claim_id']}/decide",
        json={"approve": False, "note": "证据不足"},
        headers=_headers(admin["token"]),
    )
    assert rejected.status_code == 200
    assert rejected.get_json()["data"]["status"] == "rejected"

    # Once the open claim is closed the investor may file again.
    again = _claim(client, victim["token"], amount="50")
    assert again.status_code == 200


def test_bad_input_and_missing_rights_are_rejected(client, test_dsn):
    admin = _admin(client, test_dsn, "prot-admin-5")
    victim = _player(client, "prot-victim-5")

    bad_kind = client.post(
        "/api/v1/market/protection/claims",
        json={"kind": "gambling", "amount": "10", "reason": "乱填"},
        headers=_headers(victim["token"]),
    )
    assert bad_kind.status_code == 400

    zero = _claim(client, victim["token"], amount="0")
    assert zero.status_code == 400

    claim = _claim(client, victim["token"], amount="10").get_json()["data"]
    denied = client.post(
        f"/api/v1/admin/market/protection/claims/{claim['claim_id']}/decide",
        json={"approve": True},
        headers=_headers(victim["token"]),
    )
    assert denied.status_code == 403
    assert client.get(
        "/api/v1/admin/market/protection/claims", headers=bearer(victim["token"])
    ).status_code == 403
    assert admin["token"]


def test_overview_shows_the_fund_and_only_my_claims(client, test_dsn):
    _fund(test_dsn, "300")
    admin = _admin(client, test_dsn, "prot-admin-6")
    alice = _player(client, "prot-alice")
    bob = _player(client, "prot-bob")
    _claim(client, alice["token"], amount="30")
    _claim(client, bob["token"], amount="40")

    overview = client.get(
        "/api/v1/market/protection", headers=bearer(alice["token"])
    ).get_json()["data"]
    assert overview["fund"]["payout_cap"] == "10000.0000"
    assert len(overview["claims"]) == 1
    assert overview["summary"]["pending"] == 2

    all_claims = client.get(
        "/api/v1/admin/market/protection/claims", headers=bearer(admin["token"])
    ).get_json()["data"]["claims"]
    assert len(all_claims) == 2
