"""Guest, register, login, rotation/reuse and lockout behaviour."""

from __future__ import annotations

import re

from tests.helpers import bearer, guest, login, refresh_with, register

TWELVE = {
    "antimatter",
    "element115",
    "deuterium",
    "quantumAlloy",
    "plasmaCell",
    "neuralCircuit",
    "exoticCrystal",
    "nebulaDust",
    "blackHoleFragment",
    "ancientRelic",
    "alienArtifact",
    "dimensionalShard",
}


def _cookie(response) -> str:
    raw = response.headers.get("Set-Cookie", "")
    match = re.search(r"atlas_refresh=([^;]+)", raw)
    assert match, raw
    return match.group(1)


def test_guest_session_is_stable(client):
    first = guest(client, "device-alpha")
    second = guest(client, "device-alpha")
    assert first["player"]["id"] == second["player"]["id"]
    assert set(first["resources"]) == TWELVE | {"storage_cap"}
    assert first["resources"]["storage_cap"] == 1000
    assert first["cooldowns"] == {}


def test_register_login_and_state(client):
    data = register(client)
    token = data["access_token"]
    me = client.get("/api/v1/me", headers=bearer(token))
    assert me.status_code == 200
    assert me.get_json()["data"]["account"]["status"] == "active"

    state = client.get("/api/v1/state", headers=bearer(token))
    assert state.status_code == 200
    body = state.get_json()
    assert body["state_version"] == 0
    assert set(body["data"]["resources"]) == TWELVE | {"storage_cap"}
    assert body["data"]["ship"]["level"] == 1
    assert body["data"]["assets"]["hull"] == 100
    assert body["data"]["cooldowns"] == {}

    ok = login(client)
    assert ok.status_code == 200
    assert ok.get_json()["data"]["player"]["id"] == data["player"]["id"]


def test_duplicate_email_conflicts(client):
    register(client)
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "captain@example.com", "password": "warp-drive-42"},
    )
    assert response.status_code == 409
    assert response.get_json()["code"] == "email_taken"


def test_refresh_rotation_and_reuse_detection(client, app):
    created = client.post(
        "/api/v1/auth/register",
        json={"email": "rotate@example.com", "password": "warp-drive-42"},
    )
    old_token = _cookie(created)

    rotated = refresh_with(app, old_token)
    assert rotated.status_code == 200, rotated.get_data(as_text=True)
    new_token = _cookie(rotated)
    assert new_token != old_token

    replay = refresh_with(app, old_token, user_agent="attacker/9.9")
    assert replay.status_code == 401
    assert replay.get_json()["code"] == "session_reuse_detected"

    after = refresh_with(app, new_token)
    assert after.status_code == 401
    assert after.get_json()["code"] == "session_revoked"


def test_concurrent_refresh_window_is_not_treated_as_reuse(client, app):
    created = client.post(
        "/api/v1/auth/register",
        json={"email": "double-tab@example.com", "password": "warp-drive-42"},
    )
    old_token = _cookie(created)
    assert refresh_with(app, old_token).status_code == 200

    # Same UA within the 5s window: a second tab, not an attacker.
    retry = refresh_with(app, old_token)
    assert retry.status_code == 401
    assert retry.get_json()["code"] == "session_revoked"


def test_lockout_after_five_failures(client):
    register(client)
    for _ in range(5):
        response = login(client, password="wrong-password-1")
    assert response.status_code == 423
    assert response.get_json()["code"] == "account_locked"

    blocked = login(client)
    assert blocked.status_code == 423


def test_unknown_account_is_indistinguishable(client):
    response = login(client, email="ghost@example.com", password="warp-drive-42")
    assert response.status_code == 401
    assert response.get_json()["code"] == "invalid_credentials"


def test_missing_token_is_401(client):
    response = client.get("/api/v1/state")
    assert response.status_code == 401
    assert response.get_json()["code"] == "unauthenticated"


def test_logout_revokes_refresh_cookie(client, app):
    registered = client.post(
        "/api/v1/auth/register",
        json={"email": "logout@example.com", "password": "warp-drive-42"},
    )
    token = registered.get_json()["data"]["access_token"]
    refresh = _cookie(registered)

    out = client.post("/api/v1/auth/logout", headers=bearer(token))
    assert out.status_code == 200

    reuse = refresh_with(app, refresh)
    assert reuse.status_code == 401
    assert reuse.get_json()["code"] == "session_revoked"
