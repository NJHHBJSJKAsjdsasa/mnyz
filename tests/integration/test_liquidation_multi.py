"""Liquidation across currency tiers (08 §6.6 gap closed by 0122)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest

BASE = {"cc1": Decimal(1), "cc2": Decimal(5), "cc3": Decimal(25), "cc4": Decimal(125)}


def _player(client, device: str) -> dict:
    data = guest(client, device_id=device)
    return {"token": data["access_token"], "id": data["player"]["id"]}


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _actor(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_service.actor_for_player(conn, {"id": player_id})
    return str(actor["id"])


def _fund_actor(dsn: str, actor_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn, kind="test_grant",
            moves=[Move(treasury["id"], code, -Decimal(amount)),
                   Move(actor_id, code, Decimal(amount))],
            ref_type="test", ref_id=str(uuid.uuid4()),
        )


def _holdings(dsn: str, actor_id: str) -> dict[str, Decimal]:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        rows = conn.execute(
            "SELECT currency_code, balance FROM currency_accounts "
            "WHERE actor_id = %s AND balance > 0",
            (actor_id,),
        ).fetchall()
    return {row["currency_code"]: Decimal(row["balance"]) for row in rows}


def _q1(holdings: dict[str, Decimal]) -> Decimal:
    return sum((amount * BASE.get(code, Decimal(1)) for code, amount in holdings.items()),
               Decimal(0))


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def test_liquidation_pays_out_of_every_currency_held(client, test_dsn):
    founder = _player(client, "fx-founder")
    _fund_actor(test_dsn, _actor(test_dsn, founder["id"]), "cc3", "5")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": "FXC", "name": "FXC 多币种", "shares_total": 100000},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        company = conn.execute(
            "SELECT id, treasury_actor_id FROM companies WHERE ticker = 'FXC'"
        ).fetchone()
        conn.execute("UPDATE companies SET book_value = -9000 WHERE ticker = 'FXC'")
    treasury = str(company["treasury_actor_id"])
    _fund_actor(test_dsn, treasury, "cc4", "1000")
    _fund_actor(test_dsn, treasury, "cc1", "12500")   # 12,500 Q1 on top of 125,000 Q1

    case = client.post(
        "/api/v1/insolvency",
        json={"ticker": "FXC", "kind": "liquidation", "reason": "资不抵债"},
        headers=_headers(founder["token"]),
    ).get_json()["data"]

    creditor = _player(client, "fx-creditor")
    client.post(
        f"/api/v1/insolvency/{case['case_id']}/claims",
        json={"kind": "secured", "amount": "6000"},
        headers=_headers(creditor["token"]),
    )

    admin = _player(client, "fx-admin")
    _make_admin(test_dsn, admin["id"])
    result = client.post(
        f"/api/v1/insolvency/{case['case_id']}/liquidate", json={},
        headers=_headers(admin["token"]),
    )
    assert result.status_code == 200, result.get_data(as_text=True)

    paid = _holdings(test_dsn, _actor(test_dsn, creditor["id"]))
    assert set(paid) == {"cc1", "cc4"}, paid
    assert paid["cc1"] > 0 and paid["cc4"] > 0
    # estate 137,500 Q1 - 500 cc4 fee (62,500 Q1) = 75,000 Q1 for a 6,000 cc4 claim
    # per-currency rounding leaves a few thousandths of a Q1 behind
    assert abs(_q1(paid) - Decimal("75000")) <= Decimal("0.05")

    left = _holdings(test_dsn, treasury)
    assert _q1(left) <= Decimal("0.1")   # dust only

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        claim = conn.execute(
            "SELECT amount, paid, paid_q1, status FROM insolvency_claims WHERE case_id = %s",
            (case["case_id"],),
        ).fetchone()
    assert abs(Decimal(claim["paid_q1"]) - Decimal("75000")) <= Decimal("0.05")
    assert abs(Decimal(claim["paid"]) - Decimal("600")) <= Decimal("0.001")
    # the unpaid shortfall is discharged when the company is wound up (08 §6.6)
    assert claim["status"] == "rejected"
