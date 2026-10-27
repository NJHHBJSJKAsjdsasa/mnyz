"""Stock market: IPO, matching, candles, T+1, breaker, shorting, delisting."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service, stock_service
from server.domain.currency_service import Move
from server.jobs.tasks import reconcile_currency
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _headers(token: str, key: str | None = None) -> dict[str, str]:
    headers = bearer(token)
    headers["Idempotency-Key"] = key or str(uuid.uuid4())
    return headers


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


def _actor_id(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    return str(actor["id"])


def _balance(dsn: str, player_id: str, code: str = "cc4") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        row = currency_repo.account(conn, str(actor["id"]), code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _ipo(
    client,
    dsn: str,
    *,
    ticker: str,
    device: str,
    offer: int = 250_000,
    price: str = "10",
    settlement_mode: str = "t0",
    shortable: bool = True,
) -> dict:
    founder = _player(client, f"{device}-founder")
    _fund(dsn, founder["id"], "cc3", "5")
    _fund(dsn, founder["id"], "cc4", "5000")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 星际工业", "shares_total": 1_000_000},
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
        json={
            "period": "2026-09-01",
            "revenue": "80000",
            "cost": "20000",
            "assets": "120000",
            "liabilities": "20000",
        },
        headers=_headers(founder["token"]),
    )
    assert published.status_code == 200, published.get_data(as_text=True)

    response = client.post(
        "/api/v1/stocks/ipo",
        json={
            "ticker": ticker,
            "offer_shares": offer,
            "price": price,
            "settlement_mode": settlement_mode,
            "shortable": shortable,
        },
        headers=_headers(founder["token"]),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    data["founder"] = founder
    return data


def _cancel(client, token: str, order_id: str) -> None:
    response = client.delete(f"/api/v1/stocks/orders/{order_id}", headers=_headers(token))
    assert response.status_code == 200, response.get_data(as_text=True)


def _order(client, token: str, ticker: str, *, side: str, quantity: int, price=None,
           order_type: str = "limit"):
    body = {"side": side, "type": order_type, "quantity": quantity}
    if price is not None:
        body["price"] = price
    return client.post(
        f"/api/v1/stocks/{ticker}/orders", json=body, headers=_headers(token)
    )


def test_ipo_and_limit_match(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="ACME", device="ipo")
    assert ipo["total_shares"] == 1_250_000
    assert ipo["free_float"] == 250_000

    listing = client.get("/api/v1/stocks/ACME", headers=bearer(ipo["founder"]["token"]))
    assert listing.status_code == 200
    detail = listing.get_json()["data"]
    assert detail["status"] == "listed"
    assert detail["settlement_mode"] == "t0"
    assert Decimal(detail["last_price"]) == Decimal("10")
    assert detail["order_book"]["asks"][0]["price"] == "10.0000"
    assert detail["order_book"]["asks"][0]["quantity"] == 250_000

    investor = _player(client, "ipo-investor")
    _fund(test_dsn, investor["id"], "cc4", "100000")
    filled = _order(client, investor["token"], "ACME", side="buy", quantity=1000, price="10")
    assert filled.status_code == 200, filled.get_data(as_text=True)
    trade = filled.get_json()["data"]
    assert trade["status"] == "filled"
    assert trade["filled"] == 1000
    assert trade["avg_price"] == "10.0000"
    assert len(trade["trades"]) == 1
    # 10,000 notional + 10 fee on the buy side
    assert trade["trades"][0]["fee_buy"] == "10.0000"
    assert trade["trades"][0]["tax"] == "10.0000"
    assert _balance(test_dsn, investor["id"]) == Decimal("89990.0000")

    portfolio = client.get("/api/v1/stocks/portfolio", headers=bearer(investor["token"]))
    position = portfolio.get_json()["data"]["positions"][0]
    assert position["ticker"] == "ACME"
    assert position["shares"] == 1000
    assert position["sellable"] == 1000
    assert position["avg_cost"] == "10.0000"
    assert position["market_value"] == "10000.0000"

    candles = client.get(
        "/api/v1/stocks/ACME/candles?interval=1m&limit=10", headers=bearer(investor["token"])
    )
    bars = candles.get_json()["data"]["candles"]
    assert len(bars) == 1
    assert bars[0]["o"] == bars[0]["c"] == "10.0000"
    assert bars[0]["v"] == 1000

    daily = client.get(
        "/api/v1/stocks/ACME/candles?interval=1d", headers=bearer(investor["token"])
    )
    assert daily.get_json()["data"]["candles"][0]["v"] == 1000

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        fees = conn.execute(
            """
            SELECT COALESCE(SUM(e.delta), 0) AS total
              FROM currency_ledger_entries e
              JOIN currency_ledger_transactions t ON t.id = e.tx_id
              JOIN economic_actors a ON a.id = e.actor_id
             WHERE t.kind = 'stock_trade' AND a.code = 'treasury' AND e.currency_code = 'cc4'
            """
        ).fetchone()
    assert Decimal(fees["total"]) == Decimal("30")  # 10 buy + 10 sell + 10 stamp tax


def test_market_order_takes_five_levels(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="BETA", device="mkt", offer=250_000)
    founder = ipo["founder"]
    _cancel(client, founder["token"], ipo["offer_order_id"])
    for offset in range(6):
        price = Decimal("10") + Decimal(offset) / Decimal(10)
        placed = _order(client, founder["token"], "BETA", side="sell", quantity=10,
                        price=str(price))
        assert placed.status_code == 200, placed.get_data(as_text=True)

    investor = _player(client, "mkt-investor")
    _fund(test_dsn, investor["id"], "cc4", "100000")
    result = _order(client, investor["token"], "BETA", side="buy", quantity=100,
                    order_type="market")
    assert result.status_code == 200, result.get_data(as_text=True)
    data = result.get_json()["data"]
    assert data["filled"] == 50  # five price levels x 10 shares
    assert data["status"] == "cancelled"
    assert len(data["trades"]) == 5
    assert Decimal(data["avg_price"]) == Decimal("10.2000")


def test_t1_lock_and_daily_unlock(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="GAMMA", device="t1", settlement_mode="t1")
    investor = _player(client, "t1-investor")
    _fund(test_dsn, investor["id"], "cc4", "100000")
    bought = _order(client, investor["token"], "GAMMA", side="buy", quantity=1000, price="10")
    assert bought.status_code == 200, bought.get_data(as_text=True)

    portfolio = client.get("/api/v1/stocks/portfolio", headers=bearer(investor["token"]))
    position = portfolio.get_json()["data"]["positions"][0]
    assert position["shares"] == 1000
    assert position["locked_shares"] == 1000
    assert position["sellable"] == 0

    blocked = _order(client, investor["token"], "GAMMA", side="sell", quantity=1000, price="10")
    assert blocked.status_code == 422, blocked.get_data(as_text=True)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE stock_holders SET locked_until = now() - interval '1 minute' "
            "WHERE locked_shares > 0"
        )
        result = stock_service.daily_tick(conn)
    assert result["unlocked_holders"] == 1

    portfolio = client.get("/api/v1/stocks/portfolio", headers=bearer(investor["token"]))
    position = portfolio.get_json()["data"]["positions"][0]
    assert position["sellable"] == 1000
    del ipo


def test_circuit_breaker_halts_new_orders(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="DELTA", device="cb")
    founder = ipo["founder"]
    _cancel(client, founder["token"], ipo["offer_order_id"])
    ask = _order(client, founder["token"], "DELTA", side="sell", quantity=100, price="12")
    assert ask.status_code == 200, ask.get_data(as_text=True)

    investor = _player(client, "cb-investor")
    _fund(test_dsn, investor["id"], "cc4", "100000")
    filled = _order(client, investor["token"], "DELTA", side="buy", quantity=100, price="12")
    assert filled.status_code == 200, filled.get_data(as_text=True)
    assert filled.get_json()["data"]["avg_price"] == "12.0000"

    halted = _order(client, investor["token"], "DELTA", side="buy", quantity=10, price="12")
    assert halted.status_code == 422
    assert "熔断" in halted.get_json()["detail"]

    detail = client.get("/api/v1/stocks/DELTA", headers=bearer(investor["token"])).get_json()["data"]
    assert detail["halted_until"] is not None


def test_position_cap_rejects_oversized_buy(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="EPSI", device="cap")
    whale = _player(client, "cap-whale")
    _fund(test_dsn, whale["id"], "cc4", "1000000")
    too_big = _order(client, whale["token"], "EPSI", side="buy", quantity=30_000, price="10")
    assert too_big.status_code == 422
    assert "10%" in too_big.get_json()["detail"]
    del ipo


def test_self_trade_never_matches(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="ZETA", device="self")
    founder = ipo["founder"]
    _cancel(client, founder["token"], ipo["offer_order_id"])
    ask = _order(client, founder["token"], "ZETA", side="sell", quantity=100, price="10")
    assert ask.status_code == 200
    own_bid = _order(client, founder["token"], "ZETA", side="buy", quantity=100, price="10")
    assert own_bid.status_code == 200
    data = own_bid.get_json()["data"]
    assert data["filled"] == 0
    assert data["status"] == "open"


def test_short_lend_and_cover(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="THETA", device="short")
    founder = ipo["founder"]
    _cancel(client, founder["token"], ipo["offer_order_id"])

    lender = _player(client, "short-lender")
    _fund(test_dsn, lender["id"], "cc4", "50000")
    ask = _order(client, founder["token"], "THETA", side="sell", quantity=200, price="10")
    assert ask.status_code == 200
    bought = _order(client, lender["token"], "THETA", side="buy", quantity=200, price="10")
    assert bought.status_code == 200, bought.get_data(as_text=True)

    lent = client.post(
        "/api/v1/stocks/THETA/lend",
        json={"quantity": 100, "fee_bps": 300, "days": 30},
        headers=_headers(lender["token"]),
    )
    assert lent.status_code == 200, lent.get_data(as_text=True)

    bid = _order(client, founder["token"], "THETA", side="buy", quantity=100, price="10")
    assert bid.status_code == 200

    shorter = _player(client, "short-seller")
    _fund(test_dsn, shorter["id"], "cc4", "50000")
    opened = client.post(
        "/api/v1/stocks/THETA/short",
        json={"quantity": 100},
        headers=_headers(shorter["token"]),
    )
    assert opened.status_code == 200, opened.get_data(as_text=True)
    position = opened.get_json()["data"]
    assert position["filled"] == 100
    assert position["avg_price"] == "10.0000"

    margin = client.get("/api/v1/stocks/margin", headers=bearer(shorter["token"]))
    data = margin.get_json()["data"]
    assert data["positions"][0]["quantity"] == 100
    assert Decimal(data["account"]["cash"]) >= Decimal("1500")

    ask2 = _order(client, founder["token"], "THETA", side="sell", quantity=100, price="10")
    assert ask2.status_code == 200
    covered = client.post(
        "/api/v1/stocks/THETA/cover",
        json={"quantity": 100},
        headers=_headers(shorter["token"]),
    )
    assert covered.status_code == 200, covered.get_data(as_text=True)
    assert covered.get_json()["data"]["covered"] == 100

    portfolio = client.get("/api/v1/stocks/portfolio", headers=bearer(shorter["token"]))
    assert portfolio.get_json()["data"]["shorts"] == []

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        lending = conn.execute("SELECT status FROM securities_lending").fetchone()
    assert lending["status"] == "returned"


def test_dividend_pays_holders(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="IOTA", device="div")
    founder = ipo["founder"]
    investor = _player(client, "div-investor")
    _fund(test_dsn, investor["id"], "cc4", "100000")
    bought = _order(client, investor["token"], "IOTA", side="buy", quantity=1000, price="10")
    assert bought.status_code == 200, bought.get_data(as_text=True)

    before = _balance(test_dsn, investor["id"])
    paid = client.post(
        "/api/v1/stocks/IOTA/dividends",
        json={"per_share": "0.001"},
        headers=_headers(founder["token"]),
    )
    assert paid.status_code == 200, paid.get_data(as_text=True)
    assert _balance(test_dsn, investor["id"]) - before == Decimal("1.0000")

    history = client.get("/api/v1/stocks/IOTA/dividends", headers=bearer(investor["token"]))
    assert history.get_json()["data"]["dividends"][0]["per_share"] == "0.0010"


def test_delisting_triggered_by_negative_equity(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="KAPPA", device="delist")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE companies SET book_value = -1 WHERE ticker = 'KAPPA'")
        result = stock_service.daily_tick(conn)
    assert result["delisting"][0]["ticker"] == "KAPPA"

    status = client.get(
        "/api/v1/stocks/KAPPA/delisting", headers=bearer(ipo["founder"]["token"])
    ).get_json()["data"]
    assert status["status"] == "suspended"
    assert status["case"]["status"] == "triggered"


def test_ledger_reconciles_after_trading(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="LAMBD", device="recon")
    founder = ipo["founder"]
    _cancel(client, founder["token"], ipo["offer_order_id"])
    for offset in range(3):
        _order(client, founder["token"], "LAMBD", side="sell", quantity=50,
               price=str(Decimal("10") + Decimal(offset) / Decimal(10)))
    buyer = _player(client, "recon-buyer")
    _fund(test_dsn, buyer["id"], "cc4", "100000")
    for offset in range(3):
        price = str(Decimal("10") + Decimal(offset) / Decimal(10))
        result = _order(client, buyer["token"], "LAMBD", side="buy", quantity=50, price=price)
        assert result.status_code == 200, result.get_data(as_text=True)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        report = reconcile_currency(conn, hours=24)
    assert report["unbalanced"] == []

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        traded = conn.execute(
            "SELECT COALESCE(SUM(quantity), 0) AS qty FROM stock_trades"
        ).fetchone()
        held = conn.execute(
            "SELECT COALESCE(SUM(shares), 0) AS qty FROM stock_holders"
        ).fetchone()
    assert int(traded["qty"]) == 150
    assert int(held["qty"]) == 1_250_000
