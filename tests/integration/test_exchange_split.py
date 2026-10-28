"""Sub-exchange matching, splits and candle archiving."""

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


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def _listed(client, dsn, *, ticker: str, device: str, exchange_code: str | None = None) -> dict:
    founder = _player(client, device)
    _fund_actor(dsn, _actor(dsn, founder["id"]), "cc3", "50")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 交易所测试", "shares_total": 100000},
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
    _fund_actor(dsn, str(company["treasury_actor_id"]), "cc4", "100000")
    payload = {"ticker": ticker, "price": "10", "offer_shares": 40000}
    if exchange_code:
        payload["exchange_code"] = exchange_code
    ipo = client.post("/api/v1/stocks/ipo", json=payload, headers=_headers(founder["token"]))
    assert ipo.status_code == 200, ipo.get_data(as_text=True)
    return {"founder": founder, "treasury": str(company["treasury_actor_id"])}


def test_sub_exchange_licence_and_listing_fee(client, test_dsn):
    operator = _player(client, "xsub-operator")
    operator_actor = _actor(test_dsn, operator["id"])
    _fund_actor(test_dsn, operator_actor, "cc4", "6000")

    created = client.post(
        "/api/v1/exchanges",
        json={"code": "XSUB", "name": "次级交易所", "fee_bps": 15, "listing_fee": "100"},
        headers=_headers(operator["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    body = created.get_json()["data"]
    assert body["fee_bps"] == 15
    assert Decimal(body["licence_fee"]) == Decimal("5000")
    assert _balance(test_dsn, operator_actor) == Decimal("1000.0000")

    listing = client.get("/api/v1/exchanges", headers=bearer(operator["token"]))
    codes = {row["code"]: row for row in listing.get_json()["data"]["exchanges"]}
    assert codes["XSUB"]["kind"] == "sub"
    assert codes["XSUB"]["fee_bps"] == 15

    setup = _listed(client, test_dsn, ticker="XSC", device="xsub-founder",
                    exchange_code="XSUB")
    assert _balance(test_dsn, operator_actor) == Decimal("1100.0000")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        exchange_id = conn.execute(
            "SELECT exchange_id FROM stock_listings WHERE ticker = 'XSC'"
        ).fetchone()["exchange_id"]
        expected = conn.execute(
            "SELECT id FROM exchanges WHERE code = 'XSUB'"
        ).fetchone()["id"]
    assert str(exchange_id) == str(expected)
    del setup


def test_sub_exchange_fee_bps_is_used_for_trades(client, test_dsn):
    operator = _player(client, "xsub-op2")
    _fund_actor(test_dsn, _actor(test_dsn, operator["id"]), "cc4", "6000")
    client.post(
        "/api/v1/exchanges",
        json={"code": "XTWO", "name": "次级交易所二", "fee_bps": 15},
        headers=_headers(operator["token"]),
    )
    setup = _listed(client, test_dsn, ticker="XTW", device="xsub-founder-2",
                    exchange_code="XTWO")
    trader = _player(client, "xsub-trader")
    _fund_actor(test_dsn, _actor(test_dsn, trader["id"]), "cc4", "5000")

    # the book ask sits at the IPO price; buy 100 @ 10 -> notional 1000
    client.post(
        "/api/v1/stocks/XTW/orders",
        json={"side": "buy", "type": "limit", "price": "10", "quantity": 100},
        headers=_headers(trader["token"]),
    )
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        trade = conn.execute(
            "SELECT fee_buy, fee_sell, tax FROM stock_trades ORDER BY executed_at DESC LIMIT 1"
        ).fetchone()
        collected = conn.execute(
            "SELECT amount FROM revenue_collections WHERE kind = 'stock_fee' "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
    # 1000 * 15bp = 1.5 per side (+ 10bp stamp tax on the sell side)
    assert Decimal(trade["fee_buy"]) == Decimal("1.5000")
    assert Decimal(trade["fee_sell"]) == Decimal("1.5000")
    assert Decimal(collected["amount"]) == Decimal("4.0000")
    del setup


def test_split_adjusts_price_holders_and_candles(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="SPL", device="split-founder")
    trader = _player(client, "split-trader")
    _fund_actor(test_dsn, _actor(test_dsn, trader["id"]), "cc4", "5000")
    client.post(
        "/api/v1/stocks/SPL/orders",
        json={"side": "buy", "type": "limit", "price": "10", "quantity": 100},
        headers=_headers(trader["token"]),
    )
    # leave a resting order that the split must cancel
    client.post(
        "/api/v1/stocks/SPL/orders",
        json={"side": "buy", "type": "limit", "price": "9", "quantity": 10},
        headers=_headers(trader["token"]),
    )

    trader_actor = _actor(test_dsn, trader["id"])
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        before = conn.execute(
            "SELECT shares, avg_cost FROM stock_holders WHERE listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = 'SPL') AND actor_id = %s",
            (trader_actor,),
        ).fetchone()
    assert int(before["shares"]) == 100

    split = client.post(
        "/api/v1/stocks/SPL/split", json={"ratio": "2"},
        headers=_headers(setup["founder"]["token"]),
    )
    assert split.status_code == 200, split.get_data(as_text=True)
    body = split.get_json()["data"]
    assert body["ratio"] == "2"
    assert Decimal(body["last_price"]) == Decimal("5.0000")
    assert body["cancelled_orders"] >= 1

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        after = conn.execute(
            "SELECT shares, avg_cost FROM stock_holders WHERE listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = 'SPL') AND actor_id = %s",
            (trader_actor,),
        ).fetchone()
        candle = conn.execute(
            "SELECT close, volume FROM stock_candles WHERE listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = 'SPL') "
            "ORDER BY bucket_start DESC LIMIT 1"
        ).fetchone()
        listing = conn.execute(
            "SELECT last_price, prev_close, total_shares, free_float FROM stock_listings "
            "WHERE ticker = 'SPL'"
        ).fetchone()
        open_orders = conn.execute(
            "SELECT COUNT(*) AS n FROM stock_orders WHERE status = 'open' AND listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = 'SPL')"
        ).fetchone()["n"]
        splits = conn.execute("SELECT COUNT(*) AS n FROM stock_splits").fetchone()["n"]
    assert int(after["shares"]) == 200
    assert Decimal(after["avg_cost"]) == Decimal("5.0000")
    assert Decimal(listing["last_price"]) == Decimal("5.0000")
    assert Decimal(listing["prev_close"]) == Decimal("5.0000")
    assert int(listing["free_float"]) == 80000
    assert Decimal(candle["close"]) == Decimal("5.0000")
    assert int(candle["volume"]) == 200
    assert int(open_orders) == 0
    assert int(splits) == 1


def test_candle_archive_moves_old_buckets(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="ARC", device="archive-founder")
    admin = _player(client, "archive-admin")
    _make_admin(test_dsn, admin["id"])

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        listing_id = conn.execute(
            "SELECT id FROM stock_listings WHERE ticker = 'ARC'"
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO stock_candles (listing_id, interval, bucket_start, open, high, low,"
            " close, volume, quote_volume, trades) VALUES (%s, '1m', now() - interval '40 days',"
            " 10, 10, 10, 10, 5, 50, 1) ON CONFLICT DO NOTHING",
            (listing_id,),
        )
        conn.execute(
            "INSERT INTO stock_candles (listing_id, interval, bucket_start, open, high, low,"
            " close, volume, quote_volume, trades) VALUES (%s, '1m', now(), 10, 10, 10, 10, 5,"
            " 50, 1) ON CONFLICT DO NOTHING",
            (listing_id,),
        )

    result = client.post(
        "/api/v1/admin/market/candles/archive", json={"days": 30},
        headers=_headers(admin["token"]),
    )
    assert result.status_code == 200, result.get_data(as_text=True)
    assert result.get_json()["data"]["archived"] == 1

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        hot = conn.execute(
            "SELECT COUNT(*) AS n FROM stock_candles WHERE bucket_start < now() - interval '30 days'"
            " AND listing_id = %s", (listing_id,),
        ).fetchone()["n"]
        archived = conn.execute(
            "SELECT COUNT(*) AS n FROM stock_candle_archive WHERE listing_id = %s", (listing_id,),
        ).fetchone()["n"]
    assert int(hot) == 0
    assert int(archived) == 1
    del setup
