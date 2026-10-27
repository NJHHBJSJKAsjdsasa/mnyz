"""AI decision providers: closed by default, shadow, canary, validation and fallback."""

from __future__ import annotations

import time

import psycopg
from psycopg.rows import dict_row

from server.domain import ai_provider
from tests.helpers import bearer
from tests.integration.test_ai_economy import (
    _fund,
    _make_admin,
    _market_with_momentum,
    _player,
    _tick,
)

TICKER = "OMEGA"


def _set_provider(client, admin, name: str, **body):
    return client.post(
        f"/api/v1/admin/ai/providers/{name}", json=body, headers=bearer(admin["token"])
    )


def _decisions(dsn):
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT ag.code, d.tick, d.provider, d.provider_version, d.fallback, d.shadow, "
            "       d.model, d.prompt_hash, d.token_in, d.token_out, d.status, d.inputs, d.result "
            "  FROM ai_decisions d JOIN ai_agents ag ON ag.id = d.agent_id "
            " ORDER BY d.id"
        ).fetchall()


def _plan(quantity: int = 1) -> dict:
    return {
        "actions": [
            {"type": "stock.order",
             "payload": {"ticker": TICKER, "side": "buy", "price": "10.3",
                         "quantity": quantity}}
        ],
        "confidence": "0.9",
        "reason": "llm candidate",
        "usage": {"input": 120, "output": 30},
    }


def test_registry_is_closed_by_default(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin")
    _make_admin(test_dsn, admin["id"])

    response = client.get("/api/v1/admin/ai/providers", headers=bearer(admin["token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    providers = {row["name"]: row for row in response.get_json()["data"]["providers"]}
    assert providers["deterministic"]["status"] == "live"
    assert providers["llm"]["status"] == "disabled"
    assert providers["llm"]["has_endpoint"] is False
    # the endpoint string itself is never echoed, only whether one is configured
    assert "endpoint" not in providers["llm"]

    player = _player(client, "prov-player")
    denied = client.get("/api/v1/admin/ai/providers", headers=bearer(player["token"]))
    assert denied.status_code == 403


def test_disabled_provider_keeps_deterministic(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin-2")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    rows = _decisions(test_dsn)
    assert rows
    assert {row["provider"] for row in rows} == {"deterministic"}
    assert not any(row["fallback"] for row in rows)
    assert not any(row["shadow"] for row in rows)


def test_shadow_records_plan_without_executing_it(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin-3")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    ai_provider.set_transport(lambda spec, payload: _plan(quantity=7))
    try:
        assert _set_provider(client, admin, "llm", status="shadow").status_code == 200
        _tick(client, admin["token"])
    finally:
        ai_provider.set_transport(None)

    rows = {row["code"]: row for row in _decisions(test_dsn) if row["tick"] >= 2}
    quant = rows["AI-004"]
    assert quant["shadow"] is True
    assert quant["provider"] == "deterministic"  # shadow never executes
    shadow_plan = quant["inputs"]["shadow_plan"]
    assert shadow_plan and shadow_plan[0]["payload"]["quantity"] == 7


def test_invalid_plan_falls_back_and_is_audited(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin-4")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    ai_provider.set_transport(lambda spec, payload: {"actions": [{"type": "transfer_all"}]})
    try:
        assert _set_provider(client, admin, "llm", status="live").status_code == 200
        _tick(client, admin["token"])
    finally:
        ai_provider.set_transport(None)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT d.provider, d.fallback, d.result FROM ai_decisions d "
            "JOIN ai_agents ag ON ag.id = d.agent_id "
            "WHERE ag.code = 'AI-004' ORDER BY d.id DESC LIMIT 1"
        ).fetchone()
    assert row["provider"] == "deterministic"
    assert row["fallback"] is True
    assert "action_not_allowed" in row["result"]["llm_error"]


def test_canary_only_uses_llm_for_allowlisted_agents(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin-5")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    ai_provider.set_transport(lambda spec, payload: _plan(quantity=1))
    try:
        updated = _set_provider(
            client, admin, "llm", status="canary", allowlist=["AI-004"], model="internal-test"
        )
        assert updated.status_code == 200, updated.get_data(as_text=True)
        _tick(client, admin["token"])
    finally:
        ai_provider.set_transport(None)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        rows = conn.execute(
            "SELECT ag.code, d.provider, d.model, d.token_in, d.token_out, d.prompt_hash "
            "  FROM ai_decisions d JOIN ai_agents ag ON ag.id = d.agent_id "
            " WHERE d.tick = (SELECT MAX(tick) FROM ai_decisions)"
        ).fetchall()
    by_code = {row["code"]: row for row in rows}
    assert by_code["AI-004"]["provider"] == "llm"
    assert by_code["AI-004"]["model"] == "internal-test"
    assert by_code["AI-004"]["token_in"] == 120
    assert by_code["AI-004"]["prompt_hash"].startswith("sha256:")
    assert by_code["AI-009"]["provider"] == "deterministic"


def test_timeout_falls_back_to_deterministic(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin-6")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    def slow(spec, payload):
        time.sleep(0.3)
        return _plan()

    ai_provider.set_transport(slow)
    try:
        _set_provider(client, admin, "llm", status="live", timeout_ms=50)
        _tick(client, admin["token"])
    finally:
        ai_provider.set_transport(None)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT d.fallback, d.result FROM ai_decisions d "
            "JOIN ai_agents ag ON ag.id = d.agent_id "
            "WHERE ag.code = 'AI-004' ORDER BY d.id DESC LIMIT 1"
        ).fetchone()
    assert row["fallback"] is True
    assert row["result"]["llm_error"] == "timeout"


def test_public_directory_never_leaks_provider(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "prov-admin-7")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")
    _set_provider(client, admin, "llm", status="live", model="secret-model")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        player_id = str(
            conn.execute("SELECT player_id FROM ai_agents WHERE code = 'AI-004'").fetchone()[
                "player_id"
            ]
        )
    body = client.get(
        f"/api/v1/players/{player_id}", headers=bearer(admin["token"])
    ).get_data(as_text=True)
    for leaked in ("provider", "secret-model", "prompt_hash", "llm"):
        assert leaked not in body
