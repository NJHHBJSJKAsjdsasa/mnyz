"""Collect endpoint: ledger, cooldown, idempotency and optimistic concurrency."""

from __future__ import annotations

import uuid

from tests.helpers import collect, guest


def test_collect_is_balanced_and_persisted(client, db_conn):
    data = guest(client)
    response = collect(client, data["access_token"])
    assert response.status_code == 200, response.get_data(as_text=True)
    body = response.get_json()
    result = body["data"]

    assert set(result["gained"]) == {"antimatter", "element115", "deuterium"}
    assert all(amount >= 1 for amount in result["gained"].values())
    assert body["state_version"] == 1
    assert response.headers["ETag"] == '"1"'
    assert set(result["balances"]) == set(result["gained"])

    rows = db_conn.execute(
        "SELECT transaction_id, SUM(delta) AS total FROM ledger_entries GROUP BY transaction_id"
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][1] == 0

    collections = db_conn.execute("SELECT count(*) FROM collections").fetchone()[0]
    assert collections == 1

    wallets = dict(db_conn.execute("SELECT resource_code, balance FROM wallets").fetchall())
    for code, amount in result["balances"].items():
        assert wallets[code] == amount


def test_idempotent_replay_returns_same_transaction(client, db_conn):
    data = guest(client)
    key = str(uuid.uuid4())
    first = collect(client, data["access_token"], idem=key)
    second = collect(client, data["access_token"], idem=key)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.headers.get("Idempotent-Replay") == "true"
    assert first.get_json()["data"]["tx_id"] == second.get_json()["data"]["tx_id"]

    assert db_conn.execute("SELECT count(*) FROM collections").fetchone()[0] == 1
    assert db_conn.execute("SELECT count(*) FROM ledger_transactions").fetchone()[0] == 1


def test_cooldown_blocks_second_collection(client):
    data = guest(client)
    assert collect(client, data["access_token"]).status_code == 200
    blocked = collect(client, data["access_token"])
    assert blocked.status_code == 429
    payload = blocked.get_json()
    assert payload["code"] == "cooldown"
    assert payload["retry_after_ms"] > 0


def test_missing_idempotency_key(client):
    data = guest(client)
    response = client.post(
        "/api/v1/planets/planet_1,2,3_0_x/collect",
        json={"coordinates": "1,2,3"},
        headers={"Authorization": f"Bearer {data['access_token']}"},
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "missing_idempotency_key"


def test_coordinates_must_match_key(client):
    data = guest(client)
    response = collect(client, data["access_token"], coordinates="9,9,9")
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_argument"


def test_if_match_rejects_stale_client(client):
    data = guest(client)
    first = collect(client, data["access_token"])
    assert first.status_code == 200

    stale = collect(client, data["access_token"], if_match="999")
    assert stale.status_code == 412
    assert stale.get_json()["code"] == "stale_state"

    fresh = collect(client, data["access_token"], if_match="1")
    assert fresh.status_code == 429


def test_invalid_coordinates_are_rejected(client):
    data = guest(client)
    response = collect(client, data["access_token"], coordinates="1,2")
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_argument"
