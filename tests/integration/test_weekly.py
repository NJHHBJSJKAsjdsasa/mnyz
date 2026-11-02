"""Weekly goals (I1): derived progress, one reward per ISO week.

The goal is computed from data the server already owns (codex entries, module
levels), so the only thing a test has to fake is *progress* — inserting codex
rows is the honest way to do that, because that is exactly how a real player
fills the codex.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _seed_codex(dsn: str, player_id: str, planets: int, elements: int = 0) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        for index in range(planets):
            conn.execute(
                "INSERT INTO codex_entries (player_id, kind, entry_key) VALUES (%s, 'planet', %s) "
                "ON CONFLICT DO NOTHING",
                (player_id, f"type-{index}"),
            )
        for index in range(elements):
            conn.execute(
                "INSERT INTO codex_entries (player_id, kind, entry_key) VALUES (%s, 'element', %s) "
                "ON CONFLICT DO NOTHING",
                (player_id, f"el-{index}"),
            )


def _seed_modules(dsn: str, player_id: str, total_levels: int) -> None:
    """Raise the flagship's first module so the ``modules`` goal is met."""
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        ship = conn.execute(
            "SELECT id FROM ships WHERE player_id = %s AND is_flagship", (player_id,)
        ).fetchone()
        module = conn.execute("SELECT code FROM module_definitions ORDER BY code LIMIT 1").fetchone()
        assert ship and module, "fixture needs a flagship and a module definition"
        conn.execute(
            """
            INSERT INTO ship_modules (ship_id, module_code, level)
            VALUES (%s, %s, %s)
            ON CONFLICT (ship_id, module_code) DO UPDATE SET level = EXCLUDED.level
            """,
            (ship["id"], module["code"], total_levels),
        )


def _balance(dsn: str, player_id: str, code: str) -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT balance FROM wallets WHERE player_id = %s AND resource_code = %s",
            (player_id, code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def test_snapshot_shape_and_targets(client):
    data = guest(client)
    response = client.get("/api/v1/weekly", headers=_headers(data["access_token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    body = response.get_json()["data"]
    assert body["week_key"].count("-W") == 1
    assert body["weeks_played"] == 1
    assert {task["id"] for task in body["tasks"]} == {"planets", "modules", "codex"}
    assert body["all_done"] is False
    assert body["claimed"] is False
    assert Decimal(body["reward"]["exoticCrystal"]) == Decimal(40)


def test_claim_before_completion_is_refused(client):
    data = guest(client)
    response = client.post("/api/v1/weekly/claim", headers=_headers(data["access_token"]))
    assert response.status_code == 422
    assert "目标未完成" in response.get_json()["detail"]


def test_claim_pays_once_per_week(client, test_dsn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _seed_codex(test_dsn, player_id, planets=30, elements=10)
    _seed_modules(test_dsn, player_id, 15)

    snapshot = client.get("/api/v1/weekly", headers=_headers(token)).get_json()["data"]
    assert snapshot["all_done"] is True, snapshot

    claimed = client.post("/api/v1/weekly/claim", headers=_headers(token))
    assert claimed.status_code == 200, claimed.get_data(as_text=True)
    body = claimed.get_json()["data"]
    assert body["gained"]["exoticCrystal"] == "40"
    assert _balance(test_dsn, player_id, "exoticCrystal") == Decimal(40)
    assert _balance(test_dsn, player_id, "dimensionalShard") == Decimal(1)

    again = client.post("/api/v1/weekly/claim", headers=_headers(token))
    assert again.status_code == 409
    assert _balance(test_dsn, player_id, "exoticCrystal") == Decimal(40)

    after = client.get("/api/v1/weekly", headers=_headers(token)).get_json()["data"]
    assert after["claimed"] is True


def test_targets_scale_with_account_age(client, test_dsn):
    data = guest(client)
    player_id = data["player"]["id"]
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET created_at = now() - interval '35 days' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )

    body = client.get("/api/v1/weekly", headers=_headers(data["access_token"])).get_json()["data"]
    assert body["weeks_played"] == 6
    planets = next(task for task in body["tasks"] if task["id"] == "planets")
    assert planets["target"] == 30 + 8 * 5
