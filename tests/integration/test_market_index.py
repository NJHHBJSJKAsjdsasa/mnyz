"""Price index and market-maker quotes."""

from __future__ import annotations

from decimal import Decimal

from server.domain import market_index
from tests.helpers import bearer
from tests.integration.test_ai_economy import (
    _headers,
    _make_admin,
    _market_with_momentum,
    _player,
)


def test_index_starts_at_base_and_moves_with_price(client, test_dsn):
    setup = _market_with_momentum(client, test_dsn)
    funder = setup["whale"]

    first = client.get("/api/v1/market/indices", headers=bearer(funder["token"]))
    assert first.status_code == 200, first.get_data(as_text=True)
    indices = {row["code"]: row for row in first.get_json()["data"]["indices"]}
    csx = indices["CSX"]
    assert Decimal(csx["value"]) == Decimal("1000.0000")
    assert csx["sample_size"] == 1
    assert csx["components"][0]["ticker"] == setup["ticker"]

    # move the price up: the index must follow because it is cap weighted
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE stock_listings SET last_price = 12.35 WHERE ticker = %s",
            (setup["ticker"],),
        )
    second = client.get("/api/v1/market/indices", headers=bearer(funder["token"]))
    value = Decimal(second.get_json()["data"]["indices"][0]["value"])
    assert value > Decimal("1000")


def test_ipo_does_not_move_the_index(client, test_dsn):
    setup = _market_with_momentum(client, test_dsn)
    token = setup["whale"]["token"]
    before = Decimal(
        client.get("/api/v1/market/indices", headers=bearer(token)).get_json()["data"]
        ["indices"][0]["value"]
    )
    assert before == Decimal("1000.0000")

    # a second listing joins the index; the divisor is adjusted so it stays put
    founder = _player(client, "idx-second-founder")
    import psycopg
    from psycopg.rows import dict_row

    from tests.integration.test_ai_economy import _fund

    _fund(test_dsn, founder["id"], "cc3", "50")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": "SEC", "name": "SEC 二号", "shares_total": 100000},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE companies SET book_value = 60000, "
                     "created_at = now() - interval '10 days' WHERE ticker = 'SEC'")
    ipo = client.post(
        "/api/v1/stocks/ipo",
        json={"ticker": "SEC", "price": "10", "offer_shares": 30000},
        headers=_headers(founder["token"]),
    )
    assert ipo.status_code == 200, ipo.get_data(as_text=True)

    after = Decimal(
        client.get("/api/v1/market/indices", headers=bearer(token)).get_json()["data"]
        ["indices"][0]["value"]
    )
    assert abs(after - before) < Decimal("0.01"), (before, after)


def test_points_are_published_once_per_minute(client, test_dsn):
    _market_with_momentum(client, test_dsn)
    admin = _player(client, "idx-admin")
    _make_admin(test_dsn, admin["id"])
    token = admin["token"]

    first = client.post("/api/v1/admin/market/index/publish", json={},
                        headers=_headers(token))
    assert first.status_code == 200, first.get_data(as_text=True)
    point = first.get_json()["data"]["points"][0]
    assert Decimal(point["value"]) > 0

    again = client.post("/api/v1/admin/market/index/publish", json={},
                        headers=_headers(token))
    assert again.get_json()["data"]["published"] == 1

    series = client.get("/api/v1/market/indices/CSX/points?limit=10",
                        headers=bearer(token))
    assert series.status_code == 200
    body = series.get_json()["data"]
    assert body["code"] == "CSX"
    assert len(body["points"]) == 1  # same minute upserts instead of duplicating
    assert body["points"][0]["v"] == point["value"]

    player = _player(client, "idx-outsider")
    denied = client.post("/api/v1/admin/market/index/publish", json={},
                         headers=_headers(player["token"]))
    assert denied.status_code == 403


def test_market_maker_quote_brackets_mid(client, test_dsn):
    setup = _market_with_momentum(client, test_dsn)
    token = setup["whale"]["token"]
    ticker = setup["ticker"]

    quote = client.get(f"/api/v1/stocks/{ticker}/quote", headers=bearer(token))
    assert quote.status_code == 200, quote.get_data(as_text=True)
    body = quote.get_json()["data"]
    mid = Decimal(body["mid"])
    quoted = Decimal(body["quoted_mid"])
    bid = Decimal(body["bid"])
    ask = Decimal(body["ask"])
    assert bid < quoted < ask
    assert Decimal(0) < mid
    assert body["spread_bps"] >= 20
    assert body["settlement_mode"] in ("t0", "t1")

    published = client.post(f"/api/v1/stocks/{ticker}/quote", json={},
                            headers=_headers(token))
    assert published.status_code == 200, published.get_data(as_text=True)
    assert Decimal(published.get_json()["data"]["bid"]) == bid


def test_quote_rejects_unknown_ticker(client, test_dsn):
    player = _player(client, "idx-quote")
    response = client.get("/api/v1/stocks/NOPE/quote", headers=bearer(player["token"]))
    assert response.status_code == 404


def test_index_is_recomputable_from_market_data(client, test_dsn):
    setup = _market_with_momentum(client, test_dsn)
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        snapshot = market_index.compute(conn, "CSX")
        base_cap = Decimal(snapshot["base_cap"])
        total_cap = Decimal(snapshot["total_cap"])
        assert base_cap == total_cap  # first computation defines the base
        listing = conn.execute(
            "SELECT last_price, free_float FROM stock_listings WHERE ticker = %s",
            (setup["ticker"],),
        ).fetchone()
    assert Decimal(snapshot["value"]) == Decimal("1000.0000")
    assert Decimal(listing["last_price"]) * Decimal(int(listing["free_float"])) == total_cap
    assert snapshot["code"] == "CSX"
