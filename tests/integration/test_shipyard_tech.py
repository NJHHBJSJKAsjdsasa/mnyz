"""M4 shipyard: upgrade, refit, overclock, repair and tech unlocks."""

from __future__ import annotations

import uuid

from tests.helpers import bearer, guest

CODES = [
    "antimatter",
    "element115",
    "deuterium",
    "quantumAlloy",
    "neuralCircuit",
    "exoticCrystal",
    "plasmaCell",
    "ancientRelic",
]


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _grant(db_conn, player_id: str, amount: int = 100000) -> None:
    for code in CODES:
        db_conn.execute(
            "UPDATE wallets SET balance = balance + %s WHERE player_id = %s AND resource_code = %s",
            (amount, player_id, code),
        )


def _state(client, token):
    return client.get("/api/v1/state", headers=bearer(token)).get_json()["data"]


def test_ship_upgrade_refit_overclock_repair(client, db_conn):
    data = guest(client)
    token = data["access_token"]
    player_id = data["player"]["id"]
    _grant(db_conn, player_id)

    upgraded = client.post("/api/v1/ship/upgrade", json={}, headers=_headers(token))
    assert upgraded.status_code == 200, upgraded.get_data(as_text=True)
    assert upgraded.get_json()["data"]["applied"]["level"] == 2
    assert _state(client, token)["ship"]["level"] == 2

    refitted = client.post("/api/v1/ship/modules/scanArray/refit", json={}, headers=_headers(token))
    assert refitted.status_code == 200, refitted.get_data(as_text=True)
    assert refitted.get_json()["data"]["applied"]["level"] == 1

    early = client.post("/api/v1/ship/modules/scanArray/overclock", json={}, headers=_headers(token))
    assert early.status_code == 422
    assert early.get_json()["code"] == "unprocessable"

    db_conn.execute(
        """
        UPDATE ship_modules SET level = 10
         WHERE module_code = 'scanArray'
           AND ship_id IN (SELECT id FROM ships WHERE player_id = %s AND is_flagship)
        """,
        (player_id,),
    )
    overclocked = client.post(
        "/api/v1/ship/modules/scanArray/overclock", json={}, headers=_headers(token)
    )
    assert overclocked.status_code == 200, overclocked.get_data(as_text=True)
    assert overclocked.get_json()["data"]["applied"]["overclock"] == 1
    assert _state(client, token)["ship"]["modules"][0]["overclock"] == 1

    db_conn.execute("UPDATE player_flags SET hull = 40 WHERE player_id = %s", (player_id,))
    repaired = client.post("/api/v1/ship/repair", json={}, headers=_headers(token))
    assert repaired.status_code == 200, repaired.get_data(as_text=True)
    assert repaired.get_json()["data"]["applied"]["hull"] == 100
    assert _state(client, token)["assets"]["hull"] == 100


def test_refit_with_voucher_consumes_server_voucher(client, db_conn):
    data = guest(client, "voucher-refit")
    token = data["access_token"]
    player_id = data["player"]["id"]
    _grant(db_conn, player_id)
    db_conn.execute("UPDATE player_flags SET vouchers = 1 WHERE player_id = %s", (player_id,))

    refit = client.post(
        "/api/v1/ship/modules/scanArray/refit",
        json={"use_voucher": True},
        headers=_headers(token),
    )
    assert refit.status_code == 200, refit.get_data(as_text=True)
    applied = refit.get_json()["data"]["applied"]
    assert applied["voucher_used"] is True
    assert applied["vouchers"] == 0
    assert applied["level"] == 1

    spent = client.post(
        "/api/v1/ship/modules/scanArray/refit",
        json={"use_voucher": True},
        headers=_headers(token),
    )
    assert spent.status_code == 422
    assert spent.get_json()["code"] == "unprocessable"


def test_tech_unlock_chain(client, db_conn):
    data = guest(client)
    token = data["access_token"]
    _grant(db_conn, data["player"]["id"])

    first = client.post("/api/v1/tech/mining-1/unlock", json={}, headers=_headers(token))
    assert first.status_code == 200, first.get_data(as_text=True)

    duplicate = client.post("/api/v1/tech/mining-1/unlock", json={}, headers=_headers(token))
    assert duplicate.status_code == 409
    assert duplicate.get_json()["code"] == "already_claimed"

    skipped = client.post("/api/v1/tech/mining-3/unlock", json={}, headers=_headers(token))
    assert skipped.status_code == 422
    assert skipped.get_json()["code"] == "unprocessable"

    second = client.post("/api/v1/tech/mining-2/unlock", json={}, headers=_headers(token))
    assert second.status_code == 200, second.get_data(as_text=True)
    assert _state(client, token)["progress"]["tech"]["mining"] == 2
