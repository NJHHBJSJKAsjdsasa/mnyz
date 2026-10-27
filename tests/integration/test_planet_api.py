"""Planet authority: generated elements, read endpoint and collect integration."""

from __future__ import annotations

from urllib.parse import quote

import psycopg

from pymodules.__planet_elements import planet_identity
from tests.helpers import bearer, collect, guest


def _universe_seed(dsn: str) -> int:
    with psycopg.connect(dsn, autocommit=True) as conn:
        return int(
            conn.execute("SELECT seed FROM universes WHERE seed_name = 'atlas-main'").fetchone()[0]
        )


def _planet_key(name: str) -> str:
    return quote(f"planet_1,2,3_0_{name}", safe=",_")


def test_planet_endpoint_matches_generator(client, test_dsn):
    data = guest(client)
    identity = planet_identity(_universe_seed(test_dsn), 1, 2, 3, 0, 0)
    url = f"/api/v1/planets/{_planet_key(identity['name'])}"

    first = client.get(url, headers=bearer(data["access_token"]))
    assert first.status_code == 200, first.get_data(as_text=True)
    body = first.get_json()["data"]
    assert body["name"] == identity["name"]
    assert body["planet_type"] == identity["planet_type"]
    assert body["elements"] == identity["elements"]
    assert body["resources"] == identity["resources"]
    assert body["source"] == "generated"
    assert body["cached"] is False

    second = client.get(url, headers=bearer(data["access_token"]))
    assert second.status_code == 200
    assert second.get_json()["data"]["cached"] is True


def test_planet_name_must_match_generation(client):
    data = guest(client)
    response = client.get(
        "/api/v1/planets/planet_1,2,3_0_not-a-real-planet",
        headers=bearer(data["access_token"]),
    )
    assert response.status_code == 404
    assert response.get_json()["code"] == "not_found"


def test_collect_uses_generated_elements(client, test_dsn, db_conn):
    data = guest(client)
    identity = planet_identity(_universe_seed(test_dsn), 1, 2, 3, 0, 0)
    key = f"planet_1,2,3_0_{identity['name']}"

    response = collect(client, data["access_token"], planet_key=key)
    assert response.status_code == 200, response.get_data(as_text=True)
    payload = response.get_json()["data"]
    assert payload["planet"]["source"] == "generated"
    assert payload["planet"]["elements"] == identity["elements"]
    assert payload["planet"]["resources"] == identity["resources"]
    for code, amount in payload["gained"].items():
        assert amount >= 0

    rows = db_conn.execute(
        "SELECT count(*) FROM universe_cache.planets WHERE planet_name = %s", (identity["name"],)
    ).fetchone()
    assert rows[0] == 1
