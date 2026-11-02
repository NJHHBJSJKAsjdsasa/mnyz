"""Brokerage membership, agency commission and multi-venue trading (05 §9, 03 §5)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _player(client, device: str) -> dict:
    data = guest(client, device_id=device)
    return {"token": data["access_token"], "id": data["player"]["id"]}


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _actor(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_service.actor_for_player(conn, {"id": player_id})
    return str(actor["id"])


def _actor_code(dsn: str, actor_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT code FROM economic_actors WHERE id = %s", (actor_id,)
        ).fetchone()["code"]


def _fund_actor(dsn: str, actor_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn, kind="test_grant",
            moves=[Move(treasury["id"], code, -Decimal(amount)),
                   Move(actor_id, code, Decimal(amount))],
            ref_type="test", ref_id=str(uuid.uuid4()),
        )


def _balance(dsn: str, actor_id: str, code: str = "cc4") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = currency_repo.account(conn, actor_id, code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _listed(client, dsn, *, ticker: str, device: str) -> dict:
    founder = _player(client, device)
    _fund_actor(dsn, _actor(dsn, founder["id"]), "cc3", "50")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 券商测试", "shares_total": 100000},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        company = conn.execute(
            "SELECT id, treasury_actor_id FROM companies WHERE ticker = %s", (ticker,)
        ).fetchone()
        conn.execute(
            "UPDATE companies SET book_value = 60000, created_at = now() - interval '10 days' "
            "WHERE ticker = %s", (ticker,),
        )
    treasury = str(company["treasury_actor_id"])
    _fund_actor(dsn, treasury, "cc4", "100000")
    ipo = client.post(
        "/api/v1/stocks/ipo",
        json={"ticker": ticker, "price": "10", "offer_shares": 40000},
        headers=_headers(founder["token"]),
    )
    assert ipo.status_code == 200, ipo.get_data(as_text=True)
    return {"founder": founder, "treasury": treasury}


def _make_broker(client, dsn, *, device: str, exchange: str = "CUEX",
                 commission_bps: int = 10, fund: str = "3000") -> dict:
    broker = _player(client, device)
    actor_id = _actor(dsn, broker["id"])
    _fund_actor(dsn, actor_id, "cc4", fund)
    firm = client.post("/api/v1/brokers/firms", json={}, headers=_headers(broker["token"]))
    assert firm.status_code == 200, firm.get_data(as_text=True)
    member = client.post(
        "/api/v1/brokers/memberships",
        json={"exchange_code": exchange, "commission_bps": commission_bps},
        headers=_headers(broker["token"]),
    )
    assert member.status_code == 200, member.get_data(as_text=True)
    return {"player": broker, "actor_id": actor_id}


def test_agency_commission_is_charged_and_paid_to_the_broker(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="BRK", device="brk-founder")
    broker = _make_broker(client, test_dsn, device="brk-broker", commission_bps=10)
    client_player = _player(client, "brk-client")
    client_actor = _actor(test_dsn, client_player["id"])
    _fund_actor(test_dsn, client_actor, "cc4", "5000")

    opened = client.post(
        "/api/v1/brokers/accounts",
        json={"broker_code": broker["actor_id"], "commission_bps": 10},
        headers=_headers(client_player["token"]),
    )
    assert opened.status_code == 200, opened.get_data(as_text=True)
    assert opened.get_json()["data"]["commission_bps"] == 10

    bought = client.post(
        "/api/v1/stocks/BRK/orders",
        json={"side": "buy", "type": "limit", "price": "10", "quantity": 100},
        headers=_headers(client_player["token"]),
    )
    assert bought.status_code == 200, bought.get_data(as_text=True)
    body = bought.get_json()["data"]
    assert body["venue"] == "CUEX"
    trade = body["trades"][0]
    assert Decimal(trade["fee_buy"]) == Decimal("1.0000")

    # 1000 notional → 1.0 exchange fee + 1.0 agency commission
    assert _balance(test_dsn, client_actor) == Decimal("3998.0000")
    assert _balance(test_dsn, broker["actor_id"]) == Decimal("501.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        commission = conn.execute(
            "SELECT broker_actor_id, client_actor_id, commission_bps, amount, notional "
            "  FROM broker_commissions"
        ).fetchall()
    assert len(commission) == 1
    row = commission[0]
    assert str(row["broker_actor_id"]) == broker["actor_id"]
    assert str(row["client_actor_id"]) == client_actor
    assert int(row["commission_bps"]) == 10
    assert Decimal(row["amount"]) == Decimal("1.0000")

    book = client.get("/api/v1/brokers/me", headers=bearer(broker["player"]["token"]))
    assert book.status_code == 200, book.get_data(as_text=True)
    data = book.get_json()["data"]
    assert data["earned"]["cc4"] == "1.0000"
    assert len(data["clients"]) == 1
    del setup


def test_commission_is_capped_and_needs_membership(client, test_dsn):
    _listed(client, test_dsn, ticker="CAP", device="cap-founder")

    unaffiliated = _player(client, "cap-free")
    _fund_actor(test_dsn, _actor(test_dsn, unaffiliated["id"]), "cc4", "2500")
    assert client.post("/api/v1/brokers/firms", json={},
                       headers=_headers(unaffiliated["token"])).status_code == 200
    free_actor = _actor(test_dsn, unaffiliated["id"])

    client_player = _player(client, "cap-client")
    rejected = client.post(
        "/api/v1/brokers/accounts",
        json={"broker_code": free_actor},
        headers=_headers(client_player["token"]),
    )
    assert rejected.status_code == 422
    assert "会籍" in rejected.get_json()["detail"]

    broker = _make_broker(client, test_dsn, device="cap-broker", commission_bps=5)
    too_high = client.post(
        "/api/v1/brokers/accounts",
        json={"broker_code": broker["actor_id"], "commission_bps": 50},
        headers=_headers(client_player["token"]),
    )
    assert too_high.status_code == 422
    assert "5bp" in too_high.get_json()["detail"]

    ok = client.post(
        "/api/v1/brokers/accounts",
        json={"broker_code": broker["actor_id"]},
        headers=_headers(client_player["token"]),
    )
    assert ok.status_code == 200, ok.get_data(as_text=True)
    assert ok.get_json()["data"]["commission_bps"] == 5


def test_listing_trades_on_two_venues_with_its_own_fee(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="XVN", device="xvn-founder")
    operator = _player(client, "xvn-operator")
    _fund_actor(test_dsn, _actor(test_dsn, operator["id"]), "cc4", "6000")
    opened = client.post(
        "/api/v1/exchanges",
        json={"code": "XVEX", "name": "跨所交易所", "fee_bps": 20},
        headers=_headers(operator["token"]),
    )
    assert opened.status_code == 200, opened.get_data(as_text=True)

    admitted = client.post(
        "/api/v1/stocks/XVN/venues",
        json={"exchange_code": "XVEX"},
        headers=_headers(operator["token"]),
    )
    assert admitted.status_code == 200, admitted.get_data(as_text=True)
    assert admitted.get_json()["data"]["fee_bps"] == 20

    venues = client.get("/api/v1/stocks/XVN/venues", headers=bearer(operator["token"]))
    by_code = {row["exchange"]: row for row in venues.get_json()["data"]["venues"]}
    assert set(by_code) == {"CUEX", "XVEX"}
    assert by_code["XVEX"]["best_ask"] is None       # nothing quoted there yet

    # the listing payload itself carries every venue and its fee (no N+1 for the UI)
    board = client.get("/api/v1/stocks", headers=bearer(operator["token"]))
    rows = {row["ticker"]: row for row in board.get_json()["data"]["stocks"]}
    xvn = rows["XVN"]
    assert xvn["exchange_code"] == "CUEX"
    assert {v["exchange_code"]: v["fee_bps"] for v in xvn["venues"]} == {
        "CUEX": xvn["fee_bps"], "XVEX": 20,
    }
    detail = client.get("/api/v1/stocks/XVN", headers=bearer(operator["token"]))
    detail_body = detail.get_json()["data"]
    assert detail_body["exchange_id"] == xvn["exchange_id"]
    assert len(detail_body["venues"]) == 2

    # founder leaves an ask only on the second venue
    listed = client.post(
        "/api/v1/stocks/XVN/orders",
        json={"side": "sell", "type": "limit", "price": "11.5", "quantity": 100,
              "venue_code": "XVEX"},
        headers=_headers(setup["founder"]["token"]),
    )
    assert listed.status_code == 200, listed.get_data(as_text=True)
    assert listed.get_json()["data"]["venue"] == "XVEX"

    trader = _player(client, "xvn-trader")
    _fund_actor(test_dsn, _actor(test_dsn, trader["id"]), "cc4", "5000")

    # no venue given → router picks the best price, which is the primary book at 10
    routed = client.post(
        "/api/v1/stocks/XVN/orders",
        json={"side": "buy", "type": "market", "quantity": 50},
        headers=_headers(trader["token"]),
    )
    assert routed.status_code == 200, routed.get_data(as_text=True)
    routed_body = routed.get_json()["data"]
    assert routed_body["venue"] == "CUEX"
    assert Decimal(routed_body["trades"][0]["price"]) == Decimal("10.0000")

    # asking for the second venue fills there, at that venue's 20bp commission
    explicit = client.post(
        "/api/v1/stocks/XVN/orders",
        json={"side": "buy", "type": "limit", "price": "11.5", "quantity": 40,
              "venue_code": "XVEX"},
        headers=_headers(trader["token"]),
    )
    assert explicit.status_code == 200, explicit.get_data(as_text=True)
    explicit_body = explicit.get_json()["data"]
    assert explicit_body["venue"] == "XVEX"
    trade = explicit_body["trades"][0]
    assert Decimal(trade["price"]) == Decimal("11.5000")
    assert Decimal(trade["fee_buy"]) == Decimal("0.9200")   # 460 × 20bp

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        venues_used = conn.execute(
            "SELECT DISTINCT venue_id FROM stock_trades WHERE listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = 'XVN')"
        ).fetchall()
        stuck = conn.execute(
            "SELECT COUNT(*) AS n FROM stock_orders WHERE listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = 'XVN') AND venue_id = "
            "(SELECT id FROM exchanges WHERE code = 'CUEX') AND status = 'open'"
        ).fetchone()["n"]
    assert len(venues_used) == 2
    assert int(stuck) == 0   # the second venue's ask must not leak into the primary book

    missing = client.post(
        "/api/v1/stocks/XVN/orders",
        json={"side": "buy", "type": "limit", "price": "10", "quantity": 10,
              "venue_code": "NOPE"},
        headers=_headers(trader["token"]),
    )
    assert missing.status_code == 404, missing.get_data(as_text=True)


def test_secondary_venue_can_be_withdrawn_but_not_the_primary(client, test_dsn):
    _listed(client, test_dsn, ticker="WDR", device="wdr-founder")
    operator = _player(client, "wdr-operator")
    _fund_actor(test_dsn, _actor(test_dsn, operator["id"]), "cc4", "6000")
    client.post(
        "/api/v1/exchanges",
        json={"code": "WDRE", "name": "撤牌交易所"},
        headers=_headers(operator["token"]),
    )
    client.post(
        "/api/v1/stocks/WDR/venues",
        json={"exchange_code": "WDRE"},
        headers=_headers(operator["token"]),
    )

    secondary = client.delete(
        "/api/v1/stocks/WDR/venues/WDRE", headers=_headers(operator["token"])
    )
    assert secondary.status_code == 200, secondary.get_data(as_text=True)
    assert secondary.get_json()["data"]["status"] == "suspended"

    primary = client.delete(
        "/api/v1/stocks/WDR/venues/CUEX", headers=_headers(operator["token"])
    )
    assert primary.status_code == 422

    outsider = _player(client, "wdr-outsider")
    denied = client.post(
        "/api/v1/stocks/WDR/venues",
        json={"exchange_code": "WDRE"},
        headers=_headers(outsider["token"]),
    )
    assert denied.status_code == 403
