"""M3 exploration: surface samples, scans, codex and sector licenses."""

from __future__ import annotations

import uuid

import psycopg

from pymodules.__planet_elements import planet_identity
from tests.helpers import bearer, collect, guest


def _planet_key(dsn: str) -> str:
    with psycopg.connect(dsn, autocommit=True) as conn:
        seed = int(conn.execute("SELECT seed FROM universes WHERE seed_name = 'atlas-main'").fetchone()[0])
    identity = planet_identity(seed, 1, 2, 3, 0, 0)
    return f"planet_1,2,3_0_{identity['name']}"


def _headers(token: str, key: str | None = None) -> dict[str, str]:
    headers = bearer(token)
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _sample(client, token, planet_key, cell=10, key=None):
    return client.post(
        f"/api/v1/planets/{planet_key}/surface/sample",
        json={"cell": cell},
        headers=_headers(token, key or str(uuid.uuid4())),
    )


def _scan(client, token, planet_key, key=None):
    return client.post(
        f"/api/v1/planets/{planet_key}/scan",
        json={},
        headers=_headers(token, key or str(uuid.uuid4())),
    )


def test_surface_grid_daily_limit_and_replay(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = _planet_key(test_dsn)

    grid = client.get(f"/api/v1/planets/{key}/surface", headers=bearer(token))
    assert grid.status_code == 200, grid.get_data(as_text=True)
    payload = grid.get_json()["data"]
    assert len(payload["grid"]) == 64
    assert payload["remaining"] == 3
    assert payload["planet"]["source"] == "generated"

    idem = str(uuid.uuid4())
    first = _sample(client, token, key, cell=10, key=idem)
    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json()["data"]["remaining"] == 2

    replay = _sample(client, token, key, cell=10, key=idem)
    assert replay.status_code == 200
    assert replay.headers.get("Idempotent-Replay") == "true"
    assert replay.get_json()["data"]["remaining"] == 2

    assert _sample(client, token, key, cell=11).status_code == 200
    assert _sample(client, token, key, cell=12).status_code == 200
    blocked = _sample(client, token, key, cell=13)
    assert blocked.status_code == 409
    assert blocked.get_json()["code"] == "daily_limit"

    used = db_conn.execute("SELECT used FROM surface_samples WHERE planet_key = %s", (key.lower(),)).fetchone()
    assert used[0] == 3


def test_scan_costs_fuel_and_respects_cooldown(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = _planet_key(test_dsn)
    for cell in (10, 11, 12):
        assert _sample(client, token, key, cell=cell).status_code == 200

    idem = str(uuid.uuid4())
    first = _scan(client, token, key, key=idem)
    assert first.status_code == 200, first.get_data(as_text=True)
    payload = first.get_json()["data"]
    assert payload["cost"] == {"deuterium": 6}
    assert payload["cooldown"]["ready_in_ms"] > 0
    assert payload["scans"] == 1
    assert payload["kind"] in {"relic", "rich", "normal", "barren"}
    assert payload["planet"]["source"] == "generated"

    replay = _scan(client, token, key, key=idem)
    assert replay.status_code == 200
    assert replay.headers.get("Idempotent-Replay") == "true"
    assert replay.get_json()["data"]["tx_id"] == payload["tx_id"]

    blocked = _scan(client, token, key)
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "cooldown"

    codex = client.get("/api/v1/codex", headers=bearer(token)).get_json()["data"]
    assert codex["counts"]["planet"] == 1
    assert codex["counts"]["element"] >= 1

    rows = db_conn.execute(
        "SELECT transaction_id, SUM(delta) AS total FROM ledger_entries GROUP BY transaction_id"
    ).fetchall()
    assert rows and all(row[1] == 0 for row in rows)


def test_planet_visit_records_codex(client, test_dsn):
    data = guest(client, "codex-visit")
    token = data["access_token"]
    key = _planet_key(test_dsn)

    first = client.post(f"/api/v1/planets/{key}/visit", headers=bearer(token))
    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json()["data"]["added"] >= 2

    codex = client.get("/api/v1/codex", headers=bearer(token)).get_json()["data"]
    assert codex["counts"]["planet"] == 1
    assert codex["counts"]["element"] >= 1

    again = client.post(f"/api/v1/planets/{key}/visit", headers=bearer(token))
    assert again.status_code == 200
    assert again.get_json()["data"]["added"] == 0


def test_sector_unlock_has_no_60_cap(client, db_conn):
    data = guest(client, "sector-unlimited")
    token = data["access_token"]
    player_id = data["player"]["id"]
    db_conn.execute(
        "UPDATE wallets SET balance = 1000000 WHERE player_id = %s AND resource_code = 'antimatter'",
        (player_id,),
    )
    keys = [f"{x}-{y}-{z}" for x in range(6) for y in range(4) for z in range(3)][:60]
    for key in keys:
        db_conn.execute(
            "INSERT INTO sector_licenses (player_id, sector_key) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (player_id, key),
        )

    response = client.post(
        "/api/v1/sectors/9-9-9/unlock",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    body = response.get_json()["data"]
    assert body["unlocked"] == 61
    assert body["cost"] == 400 + 60 * 120


def test_codex_completion_claim_once(client, db_conn):
    data = guest(client, "codex-claim")
    token = data["access_token"]
    player_id = data["player"]["id"]
    db_conn.execute(
        """
        INSERT INTO codex_entries (player_id, kind, entry_key)
        SELECT %s, 'planet', 'dummy-' || value FROM generate_series(1, 27) AS value
        ON CONFLICT DO NOTHING
        """,
        (player_id,),
    )

    claimed = client.post(
        "/api/v1/codex/planets/claim",
        headers={**bearer(token), "Idempotency-Key": "codex-claim-1"},
    )
    assert claimed.status_code == 200, claimed.get_data(as_text=True)
    assert claimed.get_json()["data"]["reward"]["antimatter"] == 4000

    again = client.post(
        "/api/v1/codex/planets/claim",
        headers={**bearer(token), "Idempotency-Key": "codex-claim-2"},
    )
    assert again.status_code == 409
    assert again.get_json()["code"] == "already_claimed"


def test_scan_requires_fuel(client, test_dsn, db_conn):
    data = guest(client)
    key = _planet_key(test_dsn)
    response = _scan(client, data["access_token"], key)
    assert response.status_code == 409
    assert response.get_json()["code"] == "insufficient_funds"
    assert db_conn.execute("SELECT count(*) FROM planet_scans").fetchone()[0] == 0


def test_sector_unlock_grants_bonus(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = _planet_key(test_dsn)
    player_id = data["player"]["id"]
    db_conn.execute(
        "UPDATE wallets SET balance = balance + 1000 WHERE player_id = %s AND resource_code = 'antimatter'",
        (player_id,),
    )

    unlocked = client.post(
        "/api/v1/sectors/0-0-0/unlock",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert unlocked.status_code == 200, unlocked.get_data(as_text=True)
    body = unlocked.get_json()["data"]
    assert body["cost"] == 400
    assert body["unlocked"] == 1
    assert body["balances"]["antimatter"] == 600

    duplicate = client.post(
        "/api/v1/sectors/0-0-0/unlock",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert duplicate.status_code == 409
    assert duplicate.get_json()["code"] == "already_claimed"

    invalid = client.post(
        "/api/v1/sectors/10-0-0/unlock",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert invalid.status_code == 400

    collected = collect(client, token, planet_key=key)
    assert collected.status_code == 200, collected.get_data(as_text=True)
    assert collected.get_json()["data"]["factors"]["sector"] == 1.2
