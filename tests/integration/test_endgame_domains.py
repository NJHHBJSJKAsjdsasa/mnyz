"""M5/M5.5/M6/M6.5 smoke: assets, colonies, combat, alliances and sieges."""

from __future__ import annotations

import uuid

import psycopg

from pymodules.__planet_elements import planet_identity
from tests.helpers import bearer, collect, guest


def _key(dsn: str) -> str:
    with psycopg.connect(dsn, autocommit=True) as conn:
        seed = int(conn.execute("SELECT seed FROM universes WHERE seed_name = 'atlas-main'").fetchone()[0])
    return f"planet_1,2,3_0_{planet_identity(seed, 1, 2, 3, 0, 0)['name']}"


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _grant(db_conn, player_id: str, amount: int = 100000) -> None:
    for code in (
        "antimatter",
        "quantumAlloy",
        "plasmaCell",
        "neuralCircuit",
        "exoticCrystal",
        "element115",
        "deuterium",
    ):
        db_conn.execute(
            "UPDATE wallets SET balance = balance + %s WHERE player_id = %s AND resource_code = %s",
            (amount, player_id, code),
        )


def test_station_and_fleet_settle_claim(client, test_dsn, db_conn):
    data = guest(client, "assets-device")
    token = data["access_token"]
    player_id = data["player"]["id"]
    key = _key(test_dsn)
    _grant(db_conn, player_id)

    station = client.post("/api/v1/stations", json={"planet_key": key}, headers=_headers(token))
    assert station.status_code == 200, station.get_data(as_text=True)
    station_id = station.get_json()["data"]["station"]["id"]

    module = client.post(
        f"/api/v1/stations/{station_id}/modules/production_bay", json={}, headers=_headers(token)
    )
    assert module.status_code == 200, module.get_data(as_text=True)

    db_conn.execute(
        "UPDATE stations SET last_tick_at = now() - interval '2 hours' WHERE id = %s", (station_id,)
    )
    state = client.get("/api/v1/state", headers=bearer(token))
    assert state.status_code == 200
    assets = client.get("/api/v1/assets", headers=bearer(token)).get_json()["data"]
    assert assets["stations"][0]["stored"]

    claimed = client.post(f"/api/v1/stations/{station_id}/claim", json={}, headers=_headers(token))
    assert claimed.status_code == 200, claimed.get_data(as_text=True)
    assert claimed.get_json()["data"]["yield"]

    fleet = client.post("/api/v1/fleet", json={"name": "先锋"}, headers=_headers(token))
    assert fleet.status_code == 200, fleet.get_data(as_text=True)
    fleet_id = fleet.get_json()["data"]["fleet"]["id"]
    task = client.post(f"/api/v1/fleet/{fleet_id}/task", json={"task": "mine"}, headers=_headers(token))
    assert task.status_code == 200
    db_conn.execute(
        "UPDATE fleet_ships SET last_tick_at = now() - interval '2 hours' WHERE id = %s", (fleet_id,)
    )
    fleet_claim = client.post(f"/api/v1/fleet/{fleet_id}/claim", json={}, headers=_headers(token))
    assert fleet_claim.status_code == 200, fleet_claim.get_data(as_text=True)
    assert fleet_claim.get_json()["data"]["yield"]["antimatter"] > 0


def test_colony_claim_build_and_deposits(client, test_dsn, db_conn):
    data = guest(client, "colony-device")
    token = data["access_token"]
    key = _key(test_dsn)
    _grant(db_conn, data["player"]["id"])

    claim = client.post(f"/api/v1/planets/{key}/claim", json={}, headers=_headers(token))
    assert claim.status_code == 200, claim.get_data(as_text=True)

    build = client.post(
        f"/api/v1/planets/{key}/build",
        json={"code": "surface_mine"},
        headers=_headers(token),
    )
    assert build.status_code == 200, build.get_data(as_text=True)
    assert build.get_json()["data"]["level"] == 1

    collected = collect(client, token, planet_key=key)
    assert collected.status_code == 200, collected.get_data(as_text=True)

    colony = client.get(f"/api/v1/planets/{key}/colony", headers=bearer(token)).get_json()["data"]
    assert colony["colony"]["claimed"] is True
    assert colony["colony"]["structures"][0]["code"] == "surface_mine"
    assert colony["colony"]["deposits"]

    claimed = client.post(f"/api/v1/planets/{key}/deposits/claim", json={}, headers=_headers(token))
    assert claimed.status_code == 200, claimed.get_data(as_text=True)
    assert claimed.get_json()["data"]["yield"]


def test_combat_resolves_and_loots(client, test_dsn, db_conn):
    data = guest(client, "combat-device")
    token = data["access_token"]
    key = _key(test_dsn)
    _grant(db_conn, data["player"]["id"])
    db_conn.execute(
        """
        INSERT INTO ship_modules (ship_id, module_code, level)
        SELECT id, 'weaponArray', 5 FROM ships WHERE player_id = %s AND is_flagship
        ON CONFLICT (ship_id, module_code) DO UPDATE SET level = 5
        """,
        (data["player"]["id"],),
    )

    fleet = client.post("/api/v1/fleet", json={"name": "僚舰"}, headers=_headers(token))
    assert fleet.status_code == 200, fleet.get_data(as_text=True)

    started = client.post("/api/v1/combat/start", json={"planet_key": key}, headers=_headers(token))
    assert started.status_code == 200, started.get_data(as_text=True)
    session = started.get_json()["data"]["session"]
    session_id = session["id"]
    assert len(session["escorts"]) == 1

    status = "active"
    payload = None
    for _ in range(40):
        response = client.post(
            f"/api/v1/combat/{session_id}/action",
            json={"action": "fire"},
            headers=_headers(token),
        )
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()["data"]
        status = payload["status"]
        if status != "active":
            break
    assert status in {"won", "lost"}
    if status == "won":
        assert payload["loot"]


def test_alliance_and_leaderboard(client, test_dsn, db_conn):
    first = guest(client, "ally-a")
    second = guest(client, "ally-b")
    _grant(db_conn, first["player"]["id"], 5000)
    _grant(db_conn, second["player"]["id"], 5000)

    created = client.post(
        "/api/v1/alliances", json={"name": f"测试联盟{uuid.uuid4().hex[:6]}"}, headers=_headers(first["access_token"])
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    alliance_id = created.get_json()["data"]["alliance"]["id"]

    joined = client.post(
        "/api/v1/alliances/join",
        json={"alliance_id": alliance_id},
        headers=_headers(second["access_token"]),
    )
    assert joined.status_code == 200, joined.get_data(as_text=True)

    mine = client.get("/api/v1/alliances/mine", headers=bearer(first["access_token"])).get_json()["data"]
    assert len(mine["members"]) == 2

    board = client.get("/api/v1/leaderboard", headers=bearer(first["access_token"]))
    assert board.status_code == 200
    assert len(board.get_json()["data"]["entries"]) >= 2


def test_world_claim_siege_resolve_and_loot(app, client, test_dsn, db_conn):
    attacker = guest(client, "world-a")
    defender = guest(client, "world-b")
    _grant(db_conn, attacker["player"]["id"], 10000)
    _grant(db_conn, defender["player"]["id"], 10000)
    key = _key(test_dsn)

    claimed = client.post(
        f"/api/v1/world-planets/{key}/claim", json={}, headers=_headers(defender["access_token"])
    )
    assert claimed.status_code == 200, claimed.get_data(as_text=True)

    owned = client.get(f"/api/v1/world-planets/{key}", headers=bearer(defender["access_token"]))
    assert owned.status_code == 200, owned.get_data(as_text=True)
    assert owned.get_json()["data"]["is_owner"] is True
    assert owned.get_json()["data"]["owner_name"] == "舰长"

    # Clear the 24h new-owner shield so the siege can start in this test.
    db_conn.execute(
        "UPDATE world_planets SET shield_until = now() - interval '1 hour' WHERE planet_key = %s",
        (key.lower(),),
    )
    declared = client.post(
        f"/api/v1/world-planets/{key}/siege", json={}, headers=_headers(attacker["access_token"])
    )
    assert declared.status_code == 200, declared.get_data(as_text=True)
    siege_id = declared.get_json()["data"]["siege_id"]

    detail = client.get(f"/api/v1/sieges/{siege_id}", headers=bearer(attacker["access_token"]))
    assert detail.status_code == 200, detail.get_data(as_text=True)
    assert detail.get_json()["data"]["participants"]

    ally = guest(client, "world-c")
    joined = client.post(
        f"/api/v1/sieges/{siege_id}/join", json={}, headers=_headers(ally["access_token"])
    )
    assert joined.status_code == 200

    db_conn.execute(
        "UPDATE sieges SET resolve_at = now() - interval '1 minute' WHERE id = %s", (siege_id,)
    )
    from server.domain import world_service
    from server.infra.context import db

    with app.app_context():
        with db().transaction() as conn:
            world_service.resolve_due(conn)

    status = db_conn.execute(
        "SELECT status, outcome FROM sieges WHERE id = %s", (siege_id,)
    ).fetchone()
    assert status[0] == "resolved"

    loot = client.post("/api/v1/sieges/loot", json={}, headers=_headers(attacker["access_token"]))
    if loot.status_code == 200:
        assert loot.get_json()["data"]["yield"]
