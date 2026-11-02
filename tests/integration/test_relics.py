"""Relic archive (B4 / T-63): server decides the fragment, pays the reward once.

The three pinned hashes are the JavaScript output of ``hashText`` from
``Utils/Deterministic.tsx``. They are the contract between the two runtimes: the
client picks the lore text by index, so a drifting hash would show the wrong
story for the same planet.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import relics
from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _balance(dsn: str, player_id: str, code: str) -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT balance FROM wallets WHERE player_id = %s AND resource_code = %s",
            (player_id, code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def test_hash_matches_the_client():
    # Values printed by node: hashText(key) % 5 + 1
    cases = {
        "planet_1,2,3_0_x": 5,
        "planet_1000001,1000002,1000003_0_alpha": 3,
        "planet_5,6,7_0_z": 5,
    }
    for key, expected in cases.items():
        assert relics.fragment_index(key) == expected, key


def test_discover_returns_the_index_and_dedupes(client):
    data = guest(client)
    token = data["access_token"]
    key = "planet_1,2,3_0_x"

    first = client.post(f"/api/v1/relics/{key}", headers=_headers(token), json={})
    assert first.status_code == 200, first.get_data(as_text=True)
    body = first.get_json()["data"]
    assert body["fragment_index"] == 5
    assert body["new_fragment"] is True
    assert body["found"] == [5]

    again = client.post(f"/api/v1/relics/{key}", headers=_headers(token), json={})
    body = again.get_json()["data"]
    assert body["new_fragment"] is False
    assert body["found"] == [5]


def test_completion_pays_once(client, test_dsn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]

    # Find five distinct planet keys that map to the five fragments.
    keys: dict[int, str] = {}
    index = 0
    while len(keys) < 5 and index < 500:
        key = f"planet_probe_{index}_0_a"
        keys.setdefault(relics.fragment_index(key), key)
        index += 1
    assert len(keys) == 5, keys

    last = None
    for fragment in sorted(keys):
        response = client.post(f"/api/v1/relics/{keys[fragment]}", headers=_headers(token), json={})
        assert response.status_code == 200
        last = response.get_json()["data"]

    assert last["complete"] is True
    assert last["reward_granted"] is True
    assert last["found"] == [1, 2, 3, 4, 5]
    assert _balance(test_dsn, player_id, "ancientRelic") == Decimal(3)

    # A sixth discovery must not pay again.
    sixth = client.post("/api/v1/relics/planet_extra_0_a", headers=_headers(token), json={})
    assert sixth.get_json()["data"]["reward_granted"] is False
    assert _balance(test_dsn, player_id, "ancientRelic") == Decimal(3)


def test_progress_reflects_server_state(client):
    data = guest(client)
    token = data["access_token"]

    empty = client.get("/api/v1/relics", headers=_headers(token)).get_json()["data"]
    assert empty["found"] == [] and empty["complete"] is False

    client.post("/api/v1/relics/planet_1,2,3_0_x", headers=_headers(token), json={})
    after = client.get("/api/v1/relics", headers=_headers(token)).get_json()["data"]
    assert after["found"] == [5]
    assert after["total"] == 5
    assert after["claimed"] is False
