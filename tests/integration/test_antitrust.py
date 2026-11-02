"""Anti-trust snapshot (03 §6.3).

The metric is 30-day traded notional share per ticker. In a test database there
are only a handful of actors, so `top3 > 70%` fires on almost any trade — that is
the threshold working, not a bug. The assertions therefore check the *shape*
(shares sum to 1, HHI matches Σshare², the violation is reported with its kind),
not "no violations".
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import antitrust, currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _actor(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_service.actor_for_player(conn, {"id": player_id})
    return str(actor["id"])


def _fund(dsn: str, actor_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[Move(treasury["id"], code, -Decimal(amount)), Move(actor_id, code, Decimal(amount))],
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


def _listed(client, dsn, *, ticker: str) -> dict:
    founder = guest(client, device_id=f"{ticker}-founder")
    _fund(dsn, _actor(dsn, founder["player"]["id"]), "cc3", "50")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 反垄断测试", "shares_total": 100000},
        headers=_headers(founder["access_token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        company = conn.execute(
            "SELECT treasury_actor_id FROM companies WHERE ticker = %s", (ticker,)
        ).fetchone()
        conn.execute(
            "UPDATE companies SET book_value = 60000, created_at = now() - interval '10 days' "
            "WHERE ticker = %s",
            (ticker,),
        )
    _fund(dsn, str(company["treasury_actor_id"]), "cc4", "100000")
    ipo = client.post(
        "/api/v1/stocks/ipo",
        json={"ticker": ticker, "price": "10", "offer_shares": 40000},
        headers=_headers(founder["access_token"]),
    )
    assert ipo.status_code == 200, ipo.get_data(as_text=True)
    return {"founder": founder, "treasury": str(company["treasury_actor_id"])}


def _buy(client, dsn, *, ticker: str, device: str, quantity: int) -> str:
    buyer = guest(client, device_id=device)
    _fund(dsn, _actor(dsn, buyer["player"]["id"]), "cc4", "100000")
    response = client.post(
        f"/api/v1/stocks/{ticker}/orders",
        json={"side": "buy", "type": "market", "quantity": quantity},
        headers=_headers(buyer["access_token"]),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    return _actor(dsn, buyer["player"]["id"])


def test_snapshot_computes_shares_hhi_and_violations(client, test_dsn):
    listed = _listed(client, test_dsn, ticker="ATX")
    _make_admin(test_dsn, listed["founder"]["player"]["id"])

    buyer_a = _buy(client, test_dsn, ticker="ATX", device="atx-a", quantity=1000)
    buyer_b = _buy(client, test_dsn, ticker="ATX", device="atx-b", quantity=1000)

    response = client.post(
        "/api/v1/admin/commerce/antitrust/snapshot",
        headers=_headers(listed["founder"]["access_token"]),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    result = response.get_json()["data"]
    assert result["sectors"] == 1
    assert result["actors"] == 3  # treasury + two buyers
    assert result["thresholds"]["share"] == "0.40"
    kinds = {item["kind"] for item in result["violations"]}
    # With three participants top3 is 100%, so the concentration rule must fire.
    assert "top3" in kinds


def test_overview_reads_the_persisted_snapshot(client, test_dsn):
    listed = _listed(client, test_dsn, ticker="ATY")
    founder_id = listed["founder"]["player"]["id"]
    _make_admin(test_dsn, founder_id)
    _buy(client, test_dsn, ticker="ATY", device="aty-a", quantity=1500)

    client.post("/api/v1/admin/commerce/antitrust/snapshot", headers=_headers(listed["founder"]["access_token"]))
    page = client.get("/api/v1/admin/commerce/antitrust", headers=_headers(listed["founder"]["access_token"]))
    assert page.status_code == 200, page.get_data(as_text=True)
    body = page.get_json()["data"]

    sector = next(item for item in body["sectors"] if item["sector_key"] == "ATY")
    shares = [Decimal(actor["share"]) for actor in sector["actors"]]
    assert abs(sum(shares) - Decimal(1)) < Decimal("0.0001")
    hhi = Decimal(sector["actors"][0]["hhi"])
    assert abs(hhi - sum(share * share for share in shares) * 10000) < Decimal("0.5")


def test_snapshot_is_idempotent_for_the_same_day(client, test_dsn):
    listed = _listed(client, test_dsn, ticker="ATZ")
    _make_admin(test_dsn, listed["founder"]["player"]["id"])
    _buy(client, test_dsn, ticker="ATZ", device="atz-a", quantity=500)

    first = client.post(
        "/api/v1/admin/commerce/antitrust/snapshot",
        headers=_headers(listed["founder"]["access_token"]),
    ).get_json()["data"]
    second = client.post(
        "/api/v1/admin/commerce/antitrust/snapshot",
        headers=_headers(listed["founder"]["access_token"]),
    ).get_json()["data"]
    assert first["actors"] == second["actors"]

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        rows = conn.execute(
            "SELECT count(*) AS n FROM market_share_snapshots WHERE sector_key = 'ATZ'"
        ).fetchone()
    assert rows["n"] == first["actors"]  # upsert, not append


def test_job_entry_point_is_exported(client, test_dsn):
    from server.jobs import tasks

    assert callable(tasks.antitrust_tick)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        result = tasks.antitrust_tick(conn)
    assert result["period"] and result["sectors"] == 0
    assert antitrust.SHARE_LIMIT == Decimal("0.40")
