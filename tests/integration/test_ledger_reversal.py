"""Ledger reversals (T-32): mirrors, refusals and the derived chain state."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer
from tests.integration.test_ai_economy import _fund, _make_admin, _player


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _conn(dsn: str):
    return psycopg.connect(dsn, autocommit=True, row_factory=dict_row)


def _actor(dsn: str, player_id: str) -> dict:
    with _conn(dsn) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "冲正测试")
    return actor


def _balance(dsn: str, actor_id: str, code: str = "cc4") -> Decimal:
    with _conn(dsn) as conn:
        row = currency_repo.account(conn, actor_id, code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _treasury_id(dsn: str) -> str:
    with _conn(dsn) as conn:
        return str(currency_service.system_actor(conn, "treasury")["id"])


def _post(dsn: str, *, actor_id: str, amount: str, kind: str = "test_grant",
          code: str = "cc4") -> str:
    """Post a (deliberately) wrong transaction from treasury to the player."""
    with _conn(dsn) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        result = currency_service.post(
            conn,
            kind=kind,
            moves=[
                Move(str(treasury["id"]), code, -Decimal(amount)),
                Move(actor_id, code, Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )
    return result["tx_id"]


def _spend(dsn: str, *, actor_id: str, amount: str, code: str = "cc4") -> str:
    with _conn(dsn) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        result = currency_service.post(
            conn,
            kind="test_spend",
            moves=[
                Move(actor_id, code, -Decimal(amount)),
                Move(str(treasury["id"]), code, Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )
    return result["tx_id"]


def _admin(client, dsn: str, device: str) -> dict:
    player = _player(client, device)
    _make_admin(dsn, player["id"])
    return player


def test_reversal_mirrors_entries_and_moves_money_back(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-1")
    victim = _player(client, "rev-victim-1")
    actor = _actor(test_dsn, victim["id"])
    before = _balance(test_dsn, str(actor["id"]))

    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="120")
    assert _balance(test_dsn, str(actor["id"])) == before + Decimal("120")

    response = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "误发补偿"},
        headers=_headers(admin["token"]),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]

    assert data["reversal_of"] == tx_id
    assert data["original_kind"] == "test_grant"
    assert data["replayed"] is False
    deltas = {
        (entry["actor_id"], entry["currency_code"]): Decimal(entry["delta"])
        for entry in data["entries"]
    }
    assert deltas[(str(actor["id"]), "cc4")] == Decimal("-120")
    assert deltas[(str(_treasury_id(test_dsn)), "cc4")] == Decimal("120")
    assert _balance(test_dsn, str(actor["id"])) == before

    detail = client.get(
        f"/api/v1/admin/ledger/transactions/{tx_id}", headers=bearer(admin["token"])
    ).get_json()["data"]
    assert detail["reversal_tx_id"] == data["tx_id"]
    assert detail["net_effect"] == "reverted"
    assert detail["chain_depth"] == 1

    with _conn(test_dsn) as conn:
        audit = conn.execute(
            "SELECT action, target FROM audit_log WHERE action = 'ledger.reverse'"
        ).fetchall()
    assert len(audit) == 1
    assert str(audit[0]["target"]) == tx_id


def test_reverse_of_reversal_restores_the_original(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-2")
    victim = _player(client, "rev-victim-2")
    actor = _actor(test_dsn, victim["id"])
    before = _balance(test_dsn, str(actor["id"]))

    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="80")
    first = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "先冲正"},
        headers=_headers(admin["token"]),
    ).get_json()["data"]

    # Redo: reversing the reversal puts the money back where it was.
    second = client.post(
        f"/api/v1/admin/ledger/transactions/{first['tx_id']}/reverse",
        json={"reason": "误冲正，恢复"},
        headers=_headers(admin["token"]),
    )
    assert second.status_code == 200, second.get_data(as_text=True)
    redo = second.get_json()["data"]
    assert redo["restores"] == tx_id
    assert _balance(test_dsn, str(actor["id"])) == before + Decimal("80")

    detail = client.get(
        f"/api/v1/admin/ledger/transactions/{tx_id}", headers=bearer(admin["token"])
    ).get_json()["data"]
    # Two mirrors hang off the original, so its effect stands again.
    assert detail["net_effect"] == "applied"
    assert detail["chain_depth"] == 2

    mirror = client.get(
        f"/api/v1/admin/ledger/transactions/{first['tx_id']}", headers=bearer(admin["token"])
    ).get_json()["data"]
    assert mirror["net_effect"] == "reverted"
    assert [item["tx_id"] for item in mirror["ancestors"]] == [tx_id]


def test_a_transaction_cannot_be_reversed_twice(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-3")
    victim = _player(client, "rev-victim-3")
    actor = _actor(test_dsn, victim["id"])
    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="10")

    first = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "一次"},
        headers=_headers(admin["token"]),
    )
    assert first.status_code == 200

    again = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "两次"},
        headers=_headers(admin["token"]),
    )
    assert again.status_code == 422
    assert "已冲正" in again.get_json()["detail"]


def test_reversal_refuses_when_the_money_is_gone(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-4")
    victim = _player(client, "rev-victim-4")
    actor = _actor(test_dsn, victim["id"])
    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="50")
    _spend(test_dsn, actor_id=str(actor["id"]), amount="50")

    response = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "想追回"},
        headers=_headers(admin["token"]),
    )
    assert response.status_code == 409
    assert _balance(test_dsn, str(actor["id"])) == Decimal(0)


def test_requires_admin_and_a_reason(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-5")
    victim = _player(client, "rev-victim-5")
    actor = _actor(test_dsn, victim["id"])
    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="5")

    denied = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "我自己冲"},
        headers=_headers(victim["token"]),
    )
    assert denied.status_code == 403
    assert client.get(
        "/api/v1/admin/ledger/transactions", headers=bearer(victim["token"])
    ).status_code == 403

    blank = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": ""},
        headers=_headers(admin["token"]),
    )
    assert blank.status_code == 400


def test_list_filters_and_marks_reversed(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-6")
    victim = _player(client, "rev-victim-6")
    actor = _actor(test_dsn, victim["id"])
    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="7", kind="test_grant")
    _post(test_dsn, actor_id=str(actor["id"]), amount="9", kind="test_other")
    client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "对账"},
        headers=_headers(admin["token"]),
    )

    rows = client.get(
        "/api/v1/admin/ledger/transactions",
        query_string={"kind": "test_grant", "actor_id": str(actor["id"])},
        headers=bearer(admin["token"]),
    ).get_json()["data"]["transactions"]
    assert [row["tx_id"] for row in rows] == [tx_id]
    assert rows[0]["reversed_by"] is not None
    assert rows[0]["entry_count"] == 2

    missing = client.get(
        "/api/v1/admin/ledger/transactions/00000000-0000-0000-0000-000000000000",
        headers=bearer(admin["token"]),
    )
    assert missing.status_code == 404


def test_reversal_is_idempotent_under_retry(client, test_dsn):
    admin = _admin(client, test_dsn, "rev-admin-7")
    victim = _player(client, "rev-victim-7")
    actor = _actor(test_dsn, victim["id"])
    tx_id = _post(test_dsn, actor_id=str(actor["id"]), amount="11")
    key = str(uuid.uuid4())
    headers = {**bearer(admin["token"]), "Idempotency-Key": key}

    first = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "重试测试"}, headers=headers,
    )
    second = client.post(
        f"/api/v1/admin/ledger/transactions/{tx_id}/reverse",
        json={"reason": "重试测试"}, headers=headers,
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.headers.get("Idempotent-Replay") == "true"
    assert second.get_json()["data"]["tx_id"] == first.get_json()["data"]["tx_id"]
