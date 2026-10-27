"""HTTP helpers shared by integration tests."""

from __future__ import annotations

import uuid
from urllib.parse import quote


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def guest(client, device_id: str = "device-test-1") -> dict:
    response = client.post(
        "/api/v1/session",
        json={"universe_seed_name": "atlas-main", "device_id": device_id},
    )
    assert response.status_code in (200, 201), response.get_data(as_text=True)
    return response.get_json()["data"]


def register(client, email: str = "captain@example.com", password: str = "warp-drive-42") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "universe_seed_name": "atlas-main"},
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()["data"]


def login(client, email: str = "captain@example.com", password: str = "warp-drive-42") -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "universe_seed_name": "atlas-main"},
    )
    return response


def collect(
    client,
    token: str,
    *,
    planet_key: str = "planet_1,2,3_0_x",
    coordinates: str = "1,2,3",
    idem: str | None = None,
    if_match: str | None = None,
):
    headers = {
        **bearer(token),
        "Idempotency-Key": idem or str(uuid.uuid4()),
    }
    if if_match:
        headers["If-Match"] = if_match
    return client.post(
        f"/api/v1/planets/{quote(planet_key, safe=',_')}/collect",
        json={"coordinates": coordinates},
        headers=headers,
    )


def refresh_with(app, token: str, user_agent: str | None = None):
    """Refresh from a clean cookie jar so an earlier rotation cannot leak in."""
    isolated = app.test_client()
    isolated.set_cookie("atlas_refresh", token, path="/api/v1/auth")
    headers = {"User-Agent": user_agent} if user_agent else {}
    return isolated.post("/api/v1/auth/refresh", headers=headers)
