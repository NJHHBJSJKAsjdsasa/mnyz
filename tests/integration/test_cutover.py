"""Cutover: feature flags, shadow saves, invites, NPC seed and siege guards."""

from __future__ import annotations

import json
import uuid

import psycopg

from pymodules.__planet_elements import planet_identity
from tests.helpers import bearer, guest


def _key(dsn: str) -> str:
    with psycopg.connect(dsn, autocommit=True) as conn:
        seed = int(conn.execute("SELECT seed FROM universes WHERE seed_name = 'atlas-main'").fetchone()[0])
    return f"planet_1,2,3_0_{planet_identity(seed, 1, 2, 3, 0, 0)['name']}"


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _grant(db_conn, player_id: str, amount: int = 10000) -> None:
    for code in ("antimatter", "quantumAlloy", "plasmaCell"):
        db_conn.execute(
            "UPDATE wallets SET balance = balance + %s WHERE player_id = %s AND resource_code = %s",
            (amount, player_id, code),
        )


def test_feature_flags_and_shadow_state(client, db_conn):
    data = guest(client, "cutover-a")
    token = data["access_token"]

    flags = client.get("/api/v1/features", headers=bearer(token)).get_json()["data"]["flags"]
    assert set(flags) == {"domain.explore", "domain.economy", "domain.assets", "domain.combat"}
    assert flags["domain.explore"]["mode"] == "local"
    assert flags["domain.explore"]["enabled"] is False

    db_conn.execute(
        "UPDATE feature_flags SET mode = 'server', rollout_pct = 100, enabled = true WHERE name = 'domain.explore'"
    )
    flags = client.get("/api/v1/features", headers=bearer(token)).get_json()["data"]["flags"]
    assert flags["domain.explore"]["enabled"] is True

    saved = client.post(
        "/api/v1/shadow/state",
        json={"_atlasSpaceShip": "{\"level\":2}", "_atlasSectors": "{\"unlocked\":[]}"},
        headers=bearer(token),
    )
    assert saved.status_code == 200, saved.get_data(as_text=True)
    assert saved.get_json()["data"]["keys"] == 2

    stored = client.get("/api/v1/shadow/state", headers=bearer(token)).get_json()["data"]
    assert stored["payload"]["_atlasSpaceShip"] == "{\"level\":2}"
    assert stored["size_bytes"] > 0


def test_alliance_invite_code_and_npc_seed(client):
    leader = guest(client, "invite-leader")
    member = guest(client, "invite-member")

    created = client.post(
        "/api/v1/alliances",
        json={"name": f"邀请盟{uuid.uuid4().hex[:5]}"},
        headers=_headers(leader["access_token"]),
    )
    assert created.status_code == 200

    invite = client.post("/api/v1/alliances/invites", json={}, headers=_headers(leader["access_token"]))
    assert invite.status_code == 200, invite.get_data(as_text=True)
    code = invite.get_json()["data"]["code"]

    joined = client.post(
        "/api/v1/alliances/join-code",
        json={"code": code},
        headers=_headers(member["access_token"]),
    )
    assert joined.status_code == 200, joined.get_data(as_text=True)

    again = client.post(
        "/api/v1/alliances/join-code",
        json={"code": code},
        headers=_headers(member["access_token"]),
    )
    assert again.status_code == 409

    roster = client.get("/api/v1/alliances/mine", headers=bearer(leader["access_token"])).get_json()["data"]
    assert len(roster["members"]) == 2

    npc = client.get("/api/v1/residents", headers=bearer(leader["access_token"]))
    assert npc.status_code == 200, npc.get_data(as_text=True)
    payload = npc.get_json()["data"]
    assert len(payload["residents"]) == 6
    assert len(payload["factions"]) == 4


def test_local_save_import_once(client):
    data = guest(client, "import-save")
    token = data["access_token"]
    keys = {
        "_atlasSpaceShip": json.dumps(
            {
                "r": {"a": 120, "e": 60, "d": 30, "q": 5, "ex": 2},
                "u": {"l": 3, "mds": [{"id": "scanArray", "level": 2}]},
            }
        ),
        "_atlasHull": json.dumps({"hull": 40}),
        "_atlasSectors": json.dumps({"unlocked": ["0-0-0", "1-1-1"]}),
        "_atlasTech": json.dumps({"unlocked": ["mining-1", "travel-1"]}),
    }
    imported = client.post("/api/v1/migrations/local-save", json={"keys": keys}, headers=bearer(token))
    assert imported.status_code == 200, imported.get_data(as_text=True)
    summary = imported.get_json()["data"]
    assert summary["imported"]["resources"]["antimatter"] == 120
    assert summary["imported"]["ship_level"] == 3
    assert summary["imported"]["hull"] == 40
    assert len(summary["imported"]["sectors"]) == 2

    state = client.get("/api/v1/state", headers=bearer(token)).get_json()["data"]
    assert state["resources"]["antimatter"] == 120
    assert state["resources"]["exoticCrystal"] == 2
    assert state["ship"]["level"] == 3
    assert state["assets"]["hull"] == 40
    assert len(state["progress"]["sectors"]) == 2
    assert state["progress"]["tech"]["mining"] == 1

    again = client.post("/api/v1/migrations/local-save", json={"keys": keys}, headers=bearer(token))
    assert again.status_code == 409
    assert again.get_json()["code"] == "already_claimed"

    status = client.get("/api/v1/migrations/local-save", headers=bearer(token)).get_json()["data"]
    assert status["imported"] is True


def test_resident_meet_marks_relation(client):
    data = guest(client, "resident-meet")
    token = data["access_token"]

    listed = client.get("/api/v1/residents", headers=bearer(token)).get_json()["data"]["residents"]
    assert len(listed) == 6
    target = listed[0]
    assert target["met"] is False

    met = client.post(f"/api/v1/residents/{target['id']}/meet", json={}, headers=_headers(token))
    assert met.status_code == 200, met.get_data(as_text=True)
    assert met.get_json()["data"]["favor"] == 0

    after = client.get("/api/v1/residents", headers=bearer(token)).get_json()["data"]["residents"]
    assert next(item for item in after if item["id"] == target["id"])["met"] is True


def test_faction_reputation_view(client):
    data = guest(client, "faction-rep")
    token = data["access_token"]
    result = client.get("/api/v1/factions", headers=bearer(token))
    assert result.status_code == 200, result.get_data(as_text=True)
    payload = result.get_json()["data"]
    assert len(payload["factions"]) == 4
    assert isinstance(payload["reputation"], dict)


def test_resident_trade_updates_relation(client, db_conn):
    data = guest(client, "resident-trade")
    token = data["access_token"]
    player_id = data["player"]["id"]
    for code in ("quantumAlloy", "plasmaCell", "neuralCircuit", "deuterium"):
        db_conn.execute(
            "UPDATE wallets SET balance = balance + %s WHERE player_id = %s AND resource_code = %s",
            (1000, player_id, code),
        )

    residents = client.get("/api/v1/residents", headers=bearer(token)).get_json()["data"]["residents"]
    target = residents[1]
    traded = client.post(
        f"/api/v1/residents/{target['id']}/trade",
        json={"planet_key": "planet_1,2,3_0_trade"},
        headers=_headers(token),
    )
    assert traded.status_code == 200, traded.get_data(as_text=True)
    payload = traded.get_json()["data"]
    assert payload["spent"] and payload["gained"]
    assert payload["trades"] == 1
    assert payload["favor"] == 1

    after = client.get("/api/v1/residents", headers=bearer(token)).get_json()["data"]["residents"]
    updated = next(item for item in after if item["id"] == target["id"])
    assert updated["trades"] == 1
    assert updated["met"] is True


def test_siege_cooldown_and_level_protection(client, test_dsn, db_conn):
    attacker = guest(client, "siege-a")
    defender = guest(client, "siege-b")
    _grant(db_conn, attacker["player"]["id"])
    _grant(db_conn, defender["player"]["id"])
    key = _key(test_dsn)

    claimed = client.post(
        f"/api/v1/world-planets/{key}/claim", json={}, headers=_headers(defender["access_token"])
    )
    assert claimed.status_code == 200
    db_conn.execute(
        "UPDATE world_planets SET shield_until = now() - interval '1 hour' WHERE planet_key = %s",
        (key.lower(),),
    )

    first = client.post(
        f"/api/v1/world-planets/{key}/siege", json={}, headers=_headers(attacker["access_token"])
    )
    assert first.status_code == 200, first.get_data(as_text=True)
    siege_id = first.get_json()["data"]["siege_id"]
    db_conn.execute("UPDATE sieges SET status = 'cancelled' WHERE id = %s", (siege_id,))

    blocked = client.post(
        f"/api/v1/world-planets/{key}/siege", json={}, headers=_headers(attacker["access_token"])
    )
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "cooldown"

    db_conn.execute(
        "UPDATE sieges SET declared_at = now() - interval '80 hours' WHERE id = %s", (siege_id,)
    )
    db_conn.execute(
        "UPDATE world_planets SET level = 10 WHERE planet_key = %s", (key.lower(),)
    )
    guarded = client.post(
        f"/api/v1/world-planets/{key}/siege", json={}, headers=_headers(attacker["access_token"])
    )
    assert guarded.status_code == 422
    assert guarded.get_json()["code"] == "unprocessable"
