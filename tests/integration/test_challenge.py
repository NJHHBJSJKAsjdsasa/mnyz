"""Server-issued challenge codes start a challenge-mode combat session."""

from __future__ import annotations

import uuid

from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def test_challenge_code_round_trip(client):
    owner = guest(client, "challenge-owner")
    challenger = guest(client, "challenge-fighter")

    created = client.post("/api/v1/challenges", json={}, headers=_headers(owner["access_token"]))
    assert created.status_code == 200, created.get_data(as_text=True)
    data = created.get_json()["data"]
    code = data["code"]
    assert code.startswith("ATL1-")
    assert data["snapshot"]["level"] >= 1

    info = client.get(f"/api/v1/challenges/{code}", headers=bearer(challenger["access_token"]))
    assert info.status_code == 200, info.get_data(as_text=True)
    assert info.get_json()["data"]["snapshot"]["name"]

    fight = client.post(
        f"/api/v1/challenges/{code}/fight",
        json={},
        headers=_headers(challenger["access_token"]),
    )
    assert fight.status_code == 200, fight.get_data(as_text=True)
    payload = fight.get_json()["data"]
    assert payload["session"]["mode"] == "challenge"
    assert payload["session"]["enemy_hp"] >= 20

    session_id = payload["session"]["id"]
    action = client.post(
        f"/api/v1/combat/{session_id}/action",
        json={"action": "fire"},
        headers=_headers(challenger["access_token"]),
    )
    assert action.status_code == 200, action.get_data(as_text=True)
    assert action.get_json()["data"]["mode"] == "challenge"

    missing = client.get(
        "/api/v1/challenges/ATL1-does-not-exist", headers=bearer(challenger["access_token"])
    )
    assert missing.status_code == 404
