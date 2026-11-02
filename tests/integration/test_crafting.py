"""Server-side fabrication (G1).

Before this existed the production line debited ``quantumAlloy`` from
localStorage and credited ``exoticCrystal`` back — free rare materials for anyone
who opened devtools. The tests below pin the three things that make it a real
economy: inputs are actually burned, outputs land in the ledger, and a recipe
cannot run again before its cooldown.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain.ledger import TxRef, post_transaction
from server.infra.context import db
from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _fund(app, player_id: str, **resources: str) -> None:
    with app.app_context():
        with db().transaction() as conn:
            post_transaction(
                conn,
                player_id,
                {code: Decimal(amount) for code, amount in resources.items()},
                TxRef(kind="correction", ref_type="test", ref_id="fund"),
            )


def _balance(dsn: str, player_id: str, code: str) -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT balance FROM wallets WHERE player_id = %s AND resource_code = %s",
            (player_id, code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _view(client, token: str) -> dict:
    response = client.get("/api/v1/craft", headers=_headers(token))
    assert response.status_code == 200, response.get_data(as_text=True)
    return response.get_json()["data"]


def test_view_lists_three_recipes_with_cooldowns(client):
    data = guest(client)
    view = _view(client, data["access_token"])
    codes = {item["code"] for item in view["recipes"]}
    assert codes == {"alloy", "etch", "compress"}
    alloy = next(item for item in view["recipes"] if item["code"] == "alloy")
    assert alloy["cooldown_ms"] == 7200 * 1000
    assert alloy["cooldown_remaining_ms"] == 0
    assert alloy["affordable"] is False  # a fresh player owns nothing


def test_run_burns_inputs_and_mints_output(app, client, test_dsn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, quantumAlloy="40", plasmaCell="25")

    response = client.post("/api/v1/craft/alloy/run", headers=_headers(token), json={})
    assert response.status_code == 200, response.get_data(as_text=True)
    result = response.get_json()["data"]
    assert result["gained"] == {"exoticCrystal": "6"}
    assert result["cooldown_remaining_ms"] > 7_000_000

    assert _balance(test_dsn, player_id, "quantumAlloy") == Decimal(10)
    assert _balance(test_dsn, player_id, "plasmaCell") == Decimal(5)
    assert _balance(test_dsn, player_id, "exoticCrystal") == Decimal(6)


def test_cooldown_blocks_a_second_run(app, client, test_dsn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, quantumAlloy="80", plasmaCell="60")

    first = client.post("/api/v1/craft/alloy/run", headers=_headers(token), json={})
    assert first.status_code == 200

    second = client.post("/api/v1/craft/alloy/run", headers=_headers(token), json={})
    assert second.status_code == 429
    body = second.get_json()
    assert body["code"] == "cooldown"
    assert body["retry_after_ms"] > 0
    # Nothing was consumed by the refused attempt.
    assert _balance(test_dsn, player_id, "quantumAlloy") == Decimal(50)


def test_missing_materials_are_refused_without_partial_charge(app, client, test_dsn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, quantumAlloy="5", plasmaCell="20")  # short on alloy

    response = client.post("/api/v1/craft/alloy/run", headers=_headers(token), json={})
    assert response.status_code == 400
    assert "原料不足" in response.get_json()["detail"]
    assert _balance(test_dsn, player_id, "quantumAlloy") == Decimal(5)
    assert _balance(test_dsn, player_id, "plasmaCell") == Decimal(20)


def test_unknown_recipe_is_404(client):
    data = guest(client)
    response = client.post("/api/v1/craft/unobtainium/run", headers=_headers(data["access_token"]), json={})
    assert response.status_code == 404


def test_same_idempotency_key_does_not_craft_twice(app, client, test_dsn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, neuralCircuit="48", quantumAlloy="24")

    headers = {**bearer(token), "Idempotency-Key": "craft-etch-once"}
    first = client.post("/api/v1/craft/etch/run", headers=headers, json={})
    second = client.post("/api/v1/craft/etch/run", headers=headers, json={})
    assert first.status_code == 200
    assert second.status_code == 200
    assert _balance(test_dsn, player_id, "ancientRelic") == Decimal(2)
