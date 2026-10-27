"""AI players: provisioning, deterministic decisions, replay, pause, same limits."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import ai_economy, currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _player(client, device: str) -> dict:
    data = guest(client, device_id=device)
    return {"token": data["access_token"], "id": data["player"]["id"]}


def _fund(dsn: str, player_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[
                Move(treasury["id"], code, -Decimal(amount)),
                Move(actor["id"], code, Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def _market_with_momentum(client, dsn: str, *, ticker: str = "OMEGA") -> dict:
    """IPO, then a +3% print so momentum and market-making personas have a signal."""
    founder = _player(client, f"{ticker}-founder")
    _fund(dsn, founder["id"], "cc3", "5")
    _fund(dsn, founder["id"], "cc4", "5000")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 重工", "shares_total": 1_000_000},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE companies SET created_at = now() - interval '8 days' WHERE ticker = %s",
            (ticker,),
        )
    published = client.post(
        f"/api/v1/companies/{ticker}/financials",
        json={"period": "2026-09-01", "revenue": "80000", "cost": "20000",
              "assets": "120000", "liabilities": "20000"},
        headers=_headers(founder["token"]),
    )
    assert published.status_code == 200, published.get_data(as_text=True)
    ipo = client.post(
        "/api/v1/stocks/ipo",
        json={"ticker": ticker, "offer_shares": 250_000, "price": "10"},
        headers=_headers(founder["token"]),
    )
    assert ipo.status_code == 200, ipo.get_data(as_text=True)
    offer_id = ipo.get_json()["data"]["offer_order_id"]
    cancelled = client.delete(
        f"/api/v1/stocks/orders/{offer_id}", headers=_headers(founder["token"])
    )
    assert cancelled.status_code == 200, cancelled.get_data(as_text=True)
    ask = client.post(
        f"/api/v1/stocks/{ticker}/orders",
        json={"side": "sell", "type": "limit", "price": "10.3", "quantity": 200},
        headers=_headers(founder["token"]),
    )
    assert ask.status_code == 200, ask.get_data(as_text=True)
    whale = _player(client, f"{ticker}-whale")
    _fund(dsn, whale["id"], "cc4", "100000")
    filled = client.post(
        f"/api/v1/stocks/{ticker}/orders",
        json={"side": "buy", "type": "limit", "price": "10.3", "quantity": 100},
        headers=_headers(whale["token"]),
    )
    assert filled.status_code == 200, filled.get_data(as_text=True)
    assert filled.get_json()["data"]["filled"] == 100
    return {"ticker": ticker, "founder": founder, "whale": whale}


def _tick(client, token: str, **body):
    return client.post("/api/v1/admin/ai/tick", json=body, headers=bearer(token))


def test_bootstrap_provisions_first_class_players(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "ai-admin")
    _make_admin(test_dsn, admin["id"])

    result = _tick(client, admin["token"], bootstrap=9, capital="5000")
    assert result.status_code == 200, result.get_data(as_text=True)
    data = result.get_json()["data"]
    assert data["bootstrapped"] == 9
    assert data["agents"] == 9

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        agents = conn.execute(
            "SELECT code, persona, player_id, actor_id FROM ai_agents ORDER BY code"
        ).fetchall()
        ids = [str(row["player_id"]) for row in agents]
        players = conn.execute(
            "SELECT p.id, p.controller, a.email, a.password_hash, a.status "
            "FROM players p JOIN accounts a ON a.id = p.account_id "
            "WHERE p.id = ANY(%s)",
            (ids,),
        ).fetchall()
        seeded = conn.execute(
            "SELECT COUNT(*) AS n FROM economic_actors WHERE controller = 'server_ai' "
            "AND kind = 'player'"
        ).fetchone()
        seats = conn.execute(
            "SELECT COUNT(*) AS n FROM council_seats WHERE is_ai AND player_id IS NOT NULL"
        ).fetchone()
    assert len(agents) == 9
    assert {row["persona"] for row in agents} >= {"banker", "trader", "quant", "market_maker"}
    assert len(players) == 9
    for row in players:
        assert row["controller"] == "server_ai"
        assert row["email"] is None
        assert row["password_hash"] is None
        assert row["status"] == "active"
    assert int(seeded["n"]) == 9
    assert int(seats["n"]) == 5  # 06 §7: the five AI seats are AI players

    directory = client.get("/api/v1/players?controller=ai", headers=bearer(admin["token"]))
    assert directory.status_code == 200
    listed = directory.get_json()["data"]["players"]
    assert len(listed) == 9
    assert all(item["controller"] == "ai" for item in listed)
    assert "provider" not in listed[0]

    # idempotent: a second bootstrap creates nothing
    again = _tick(client, admin["token"], bootstrap=9, capital="5000")
    assert again.get_json()["data"]["bootstrapped"] == 0


def test_tick_trades_execute_and_are_replayable(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "ai-admin-2")
    _make_admin(test_dsn, admin["id"])
    first = _tick(client, admin["token"], bootstrap=9, capital="5000")
    assert first.status_code == 200, first.get_data(as_text=True)

    data = first.get_json()["data"]
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        plan = conn.execute(
            "SELECT ag.code, ag.persona, d.action, d.status FROM ai_decisions d "
            "JOIN ai_agents ag ON ag.id = d.agent_id ORDER BY ag.code"
        ).fetchall()
    assert data["executed"] == 2, "\n".join(
        f"{row['code']} {row['persona']} {row['action']} {row['status']}" for row in plan
    )
    assert data["skipped"] == 7
    assert data["failed"] == 0

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        decisions = conn.execute(
            "SELECT agent_id, tick, action, status FROM ai_decisions ORDER BY id"
        ).fetchall()
        holdings = conn.execute(
            "SELECT ag.code, COALESCE(SUM(h.shares), 0) AS shares "
            "FROM ai_agents ag LEFT JOIN stock_holders h ON h.actor_id = ag.actor_id "
            "GROUP BY ag.code ORDER BY ag.code"
        ).fetchall()
        for row in decisions:
            assert ai_economy.replay(conn, str(row["agent_id"]), int(row["tick"]))["match"]

    assert len(decisions) == 9
    executed = [row for row in decisions if row["status"] == "executed"]
    assert len(executed) == 2
    assert {row["action"] for row in executed} == {"stock.order"}
    by_code = {row["code"]: int(row["shares"]) for row in holdings}
    assert by_code["AI-004"] > 0  # quant
    assert by_code["AI-009"] > 0  # market_maker


def test_runtime_pause_only_stops_auto_orders(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "ai-admin-3")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    paused = client.post(
        "/api/v1/admin/ai/runtime-pause", json={"paused": True}, headers=bearer(admin["token"])
    )
    assert paused.status_code == 200, paused.get_data(as_text=True)
    before = _count(client, admin, test_dsn)

    blocked = _tick(client, admin["token"])
    assert blocked.get_json()["data"]["paused"] is True
    assert _count(client, admin, test_dsn) == before

    resumed = client.post(
        "/api/v1/admin/ai/runtime-pause", json={"paused": False}, headers=bearer(admin["token"])
    )
    assert resumed.status_code == 200
    again = _tick(client, admin["token"])
    again_data = again.get_json()["data"]
    assert again_data.get("paused") is not True and again_data["agents"] == 9
    assert _count(client, admin, test_dsn) > before


def _count(client, admin, dsn) -> int:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return int(conn.execute("SELECT COUNT(*) AS n FROM ai_decisions").fetchone()["n"])


def test_ai_has_no_privilege_when_over_the_cap(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "ai-admin-4")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    # A cash-rich quant sizes past the 10% float cap; the exchange must reject it
    # for the AI exactly as it would for a human (06 §8).
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE currency_accounts SET balance = 5000000 "
            "WHERE currency_code = 'cc4' AND actor_id = "
            "(SELECT actor_id FROM ai_agents WHERE code = 'AI-004')"
        )
    second = _tick(client, admin["token"])
    assert second.get_json()["data"]["failed"] >= 1

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT d.status, d.result FROM ai_decisions d JOIN ai_agents a ON a.id = d.agent_id "
            "WHERE a.code = 'AI-004' ORDER BY d.id DESC LIMIT 1"
        ).fetchone()
    assert row["status"] == "failed"
    failures = [item for item in row["result"]["actions"] if not item["ok"]]
    assert failures[0]["error"] == "unprocessable"
    assert "10%" in failures[0]["detail"]


def test_public_report_hides_decision_source(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "ai-admin-5")
    _make_admin(test_dsn, admin["id"])
    _tick(client, admin["token"], bootstrap=9, capital="5000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        player_id = str(
            conn.execute(
                "SELECT player_id FROM ai_agents WHERE code = 'AI-004'"
            ).fetchone()["player_id"]
        )
    report = client.get(f"/api/v1/players/{player_id}", headers=bearer(admin["token"]))
    assert report.status_code == 200, report.get_data(as_text=True)
    body = report.get_json()["data"]
    assert body["controller"] == "ai"
    assert body["persona"] == "quant"
    assert Decimal(body["net_worth_q1"]) > 0
    text = report.get_data(as_text=True)
    for leaked in ("provider", "model", "prompt_hash", "llm"):
        assert leaked not in text
