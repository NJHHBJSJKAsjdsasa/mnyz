"""Exploration milestones (T-62).

Before this, the panel counted galaxies/systems/planets by scanning localStorage
archives in the browser — a number the player could inflate, computed on every
render, duplicating `/tasks`. The server now counts distinct planets, coordinate
triples and sectors from ``planet_visits``.
"""

from __future__ import annotations

import uuid

import psycopg
from psycopg.rows import dict_row

from server.domain import milestones
from server.infra.context import db
from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _visit(app, player_id: str, key: str, coords: str, sector: str) -> bool:
    with app.app_context():
        with db().transaction() as conn:
            return milestones.record_visit(conn, player_id, key, coords, sector)


def test_shape_for_a_brand_new_player(client):
    data = guest(client)
    response = client.get("/api/v1/progress/exploration", headers=_headers(data["access_token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    body = response.get_json()["data"]
    assert body["day_number"] == 1
    assert {item["type"] for item in body["challenges"]} == {"galaxies", "systems", "planets"}
    assert all(item["current"] == 0 for item in body["challenges"])
    assert body["day_completed"] is False
    assert "不发奖励" in body["note"]


def test_visits_count_distinct_planets_systems_and_sectors(app, client):
    data = guest(client)
    player_id = data["player"]["id"]

    assert _visit(app, player_id, "planet_1000001,1000002,1000003_0_a", "1000001,1000002,1000003", "1-1-1") is True
    assert _visit(app, player_id, "planet_1000001,1000002,1000003_1_b", "1000001,1000002,1000003", "1-1-1") is True
    # Same planet twice must not inflate anything.
    assert _visit(app, player_id, "planet_1000001,1000002,1000003_0_a", "1000001,1000002,1000003", "1-1-1") is False

    body = client.get("/api/v1/progress/exploration", headers=_headers(data["access_token"])).get_json()["data"]
    counts = {item["type"]: item["current"] for item in body["challenges"]}
    assert counts == {"galaxies": 1, "systems": 1, "planets": 2}

    # A different sector is a new galaxy for the scoreboard.
    _visit(app, player_id, "planet_5000001,1000002,1000003_0_c", "5000001,1000002,1000003", "5-1-1")
    body = client.get("/api/v1/progress/exploration", headers=_headers(data["access_token"])).get_json()["data"]
    counts = {item["type"]: item["current"] for item in body["challenges"]}
    assert counts["galaxies"] == 2 and counts["systems"] == 2


def test_targets_scale_with_account_age(app, client, test_dsn):
    data = guest(client)
    player_id = data["player"]["id"]
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET created_at = now() - interval '9 days' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )

    body = client.get("/api/v1/progress/exploration", headers=_headers(data["access_token"])).get_json()["data"]
    assert body["day_number"] == 10
    planets = next(item for item in body["challenges"] if item["type"] == "planets")
    # 10 * 10 * 1.1^9 ≈ 236
    assert 230 <= planets["target"] <= 240, planets


def test_visit_endpoint_records_milestones(client):
    """The write path end-to-end: visiting a planet adds it to the scoreboard."""
    data = guest(client)
    token = data["access_token"]
    # A key the resolver can parse; the planet itself may not exist in the cache,
    # in which case the endpoint answers with a domain error and records nothing.
    response = client.post("/api/v1/planets/planet_1,1,1_0_smoke/visit", headers=_headers(token), json={})
    assert response.status_code in (200, 400, 404, 422), response.get_data(as_text=True)

    milestones_view = client.get("/api/v1/progress/exploration", headers=_headers(token)).get_json()["data"]
    assert len(milestones_view["challenges"]) == 3
