"""Fee/tax collection and the revenue split (05 §11, 03 §6.2)."""

from __future__ import annotations

from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.repo import currency as currency_repo
from tests.helpers import bearer
from tests.integration.test_ai_economy import _make_admin, _market_with_momentum, _player


def _balance(dsn: str, actor_code: str, code: str = "cc4") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.system_actor(conn, actor_code) if hasattr(
            currency_repo, "system_actor"
        ) else currency_service.system_actor(conn, actor_code)
        row = currency_repo.account(conn, str(actor["id"]), code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _collections(dsn) -> list[dict]:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT id, kind, currency_code, amount, split_run_id FROM revenue_collections "
            "ORDER BY id"
        ).fetchall()


def test_stock_trade_records_fee_collection(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    rows = _collections(test_dsn)
    assert len(rows) == 1
    assert rows[0]["kind"] == "stock_fee"
    assert Decimal(rows[0]["amount"]) > 0
    assert rows[0]["split_run_id"] is None


def test_split_moves_configured_shares(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "rev-admin")
    _make_admin(test_dsn, admin["id"])

    fee = Decimal(_collections(test_dsn)[0]["amount"])
    before = {code: _balance(test_dsn, code) for code in
              ("treasury", "market", "officer_pool", "insurance_fund")}

    result = client.post(
        "/api/v1/admin/economy/revenue/split", json={"kind": "stock_fee"},
        headers=bearer(admin["token"]),
    )
    assert result.status_code == 200, result.get_data(as_text=True)
    body = result.get_json()["data"]
    assert Decimal(body["amount"]) == fee
    assert body["collections"] == 1
    legs = {leg["actor"]: Decimal(leg["amount"]) for leg in body["legs"]}
    assert legs["market"] == (fee * Decimal("0.5")).quantize(Decimal("0.0001"))
    assert legs["officer_pool"] == (fee * Decimal("0.3")).quantize(Decimal("0.0001"))
    assert legs["insurance_fund"] == (fee * Decimal("0.2")).quantize(Decimal("0.0001"))

    after = {code: _balance(test_dsn, code) for code in
             ("treasury", "market", "officer_pool", "insurance_fund")}
    assert after["market"] - before["market"] == legs["market"]
    assert after["officer_pool"] - before["officer_pool"] == legs["officer_pool"]
    assert after["insurance_fund"] - before["insurance_fund"] == legs["insurance_fund"]
    assert before["treasury"] - after["treasury"] == fee

    again = client.post(
        "/api/v1/admin/economy/revenue/split", json={"kind": "stock_fee"},
        headers=bearer(admin["token"]),
    ).get_json()["data"]
    assert again["run_id"] is None
    assert again["skipped"] == "nothing_to_split"


def test_bad_rule_is_rejected_and_ops_only(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "rev-admin-2")
    _make_admin(test_dsn, admin["id"])

    player = _player(client, "rev-player")
    denied = client.post(
        "/api/v1/admin/economy/revenue/split", json={}, headers=bearer(player["token"])
    )
    assert denied.status_code == 403

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE revenue_split_rules SET legs = %s::jsonb WHERE kind = 'stock_fee'",
            ('[{"actor":"market","share":"0.5"},{"actor":"officer_pool","share":"0.3"}]',
            ),
        )
    broken = client.post(
        "/api/v1/admin/economy/revenue/split", json={"kind": "stock_fee"},
        headers=bearer(admin["token"]),
    )
    assert broken.status_code == 422
    assert "和必须为 1" in broken.get_json()["detail"]

    overview = client.get(
        "/api/v1/admin/economy/revenue", headers=bearer(admin["token"])
    )
    assert overview.status_code == 200
    data = overview.get_json()["data"]
    rules = {row["kind"]: row for row in data["rules"]}
    assert rules["stock_fee"]["legs"][0]["actor"] == "market"
    assert rules["property_tax"]["legs"][0].get("keep") is True
