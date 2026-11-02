"""Optimistic locking on read-modify-write routes (10 §P1-2 / 11 §4.3).

The contract is deliberately opt-in: a request without ``If-Match`` behaves
exactly as before, so old clients keep working. A request *with* a stale value
must fail before any money moves — that is what stops two tabs from silently
overwriting each other.
"""

from __future__ import annotations

import uuid

from tests.helpers import bearer, guest


def _transfer(client, token: str, *, if_match: str | None = None):
    headers = {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}
    if if_match is not None:
        headers["If-Match"] = if_match
    return client.post(
        "/api/v1/wallet/transfer",
        json={
            "to_player_id": str(uuid.uuid4()),
            "currency_code": "cc1",
            "amount": "1.0000",
            "memo": "if-match probe",
        },
        headers=headers,
    )


def test_stale_if_match_is_rejected_before_the_handler(app, client):
    data = guest(client)
    response = _transfer(client, data["access_token"], if_match='"999999"')
    assert response.status_code == 412
    assert response.get_json()["code"] == "stale_state"


def test_request_without_if_match_still_works(app, client):
    data = guest(client)
    response = _transfer(client, data["access_token"])
    # The guard must not fire; the handler then fails on its own terms
    # (unknown recipient), which is a different code entirely.
    assert response.status_code != 412


def test_matching_if_match_passes_the_guard(app, client):
    data = guest(client)
    token = data["access_token"]
    state = client.get("/api/v1/state", headers=bearer(token)).get_json()
    version = state["state_version"]

    response = _transfer(client, token, if_match=f'"{version}"')
    assert response.status_code != 412


def test_state_returns_etag_header(app, client):
    data = guest(client)
    response = client.get("/api/v1/state", headers=bearer(data["access_token"]))
    assert response.headers.get("ETag", "").strip('"').isdigit()
