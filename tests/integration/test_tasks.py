"""Daily tasks: ensure rows, collect progress and one-time claim."""

from __future__ import annotations

import psycopg

from pymodules.__planet_elements import planet_identity
from tests.helpers import bearer, collect, guest


def _key(dsn: str) -> str:
    with psycopg.connect(dsn, autocommit=True) as conn:
        seed = int(conn.execute("SELECT seed FROM universes WHERE seed_name = 'atlas-main'").fetchone()[0])
    return f"planet_1,2,3_0_{planet_identity(seed, 1, 2, 3, 0, 0)['name']}"


def test_daily_tasks_progress_and_claim(client, test_dsn, db_conn):
    data = guest(client, "tasks-device")
    token = data["access_token"]
    player_id = data["player"]["id"]

    listed = client.get("/api/v1/tasks", headers=bearer(token))
    assert listed.status_code == 200, listed.get_data(as_text=True)
    tasks = listed.get_json()["data"]["tasks"]
    assert len(tasks) == 3
    assert {item["code"] for item in tasks} == {
        "planetsDiscovered",
        "antimatterCollected",
        "galaxiesVisited",
    }

    collected = collect(client, token, planet_key=_key(test_dsn))
    assert collected.status_code == 200, collected.get_data(as_text=True)

    tasks = client.get("/api/v1/tasks", headers=bearer(token)).get_json()["data"]["tasks"]
    progress = {item["code"]: item["progress"] for item in tasks}
    assert progress["planetsDiscovered"] >= 1
    assert progress["antimatterCollected"] >= 1

    db_conn.execute(
        "UPDATE player_tasks SET progress = target WHERE player_id = %s AND task_code = 'antimatterCollected'",
        (player_id,),
    )
    claim = client.post(
        "/api/v1/tasks/antimatterCollected/claim",
        headers={**bearer(token), "Idempotency-Key": "task-claim-1"},
    )
    assert claim.status_code == 200, claim.get_data(as_text=True)
    assert claim.get_json()["data"]["reward"]["quantumAlloy"] == 5

    again = client.post(
        "/api/v1/tasks/antimatterCollected/claim",
        headers={**bearer(token), "Idempotency-Key": "task-claim-2"},
    )
    assert again.status_code == 409
    assert again.get_json()["code"] == "already_claimed"
