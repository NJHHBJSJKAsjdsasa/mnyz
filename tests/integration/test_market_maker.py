"""Two-sided market making: refresh, inventory limits and book-share cap."""

from __future__ import annotations

from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from tests.helpers import bearer
from tests.integration.test_ai_economy import _headers, _market_with_momentum, _player


def _open_orders(dsn: str, actor_id: str) -> list[dict]:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT side, price, quantity, status FROM stock_orders "
            "WHERE actor_id = %s AND status = 'open' ORDER BY side",
            (actor_id,),
        ).fetchall()


def _actor_id(dsn: str, player_id: str) -> str:
    from server.repo import currency as currency_repo
    from server.domain import currency_service

    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_service.actor_for_player(conn, player_id)
    return str(actor["id"])


def test_quotes_place_both_sides_and_refresh(client, test_dsn):
    setup = _market_with_momentum(client, test_dsn)
    maker = _player(client, "mm-maker")
    funder = setup["whale"]

    # give the maker cash and inventory by buying from the founder's remaining ask
    _fund = __import__("tests.integration.test_ai_economy", fromlist=["_fund"])._fund
    _fund(test_dsn, maker["id"], "cc4", "5000")
    bought = client.post(
        f"/api/v1/stocks/{setup['ticker']}/orders",
        json={"side": "buy", "type": "limit", "price": "10.3", "quantity": 50},
        headers=_headers(maker["token"]),
    )
    assert bought.status_code == 200, bought.get_data(as_text=True)

    first = client.post(
        f"/api/v1/stocks/{setup['ticker']}/quotes",
        json={"quantity": 10},
        headers=_headers(maker["token"]),
    )
    assert first.status_code == 200, first.get_data(as_text=True)
    body = first.get_json()["data"]
    assert set(body["orders"]) == {"buy", "sell"}
    assert Decimal(body["orders"]["buy"]["price"]) < Decimal(body["orders"]["sell"]["price"])

    actor_id = _actor_id(test_dsn, maker["id"])
    orders = _open_orders(test_dsn, actor_id)
    assert len(orders) == 2
    assert {row["side"] for row in orders} == {"buy", "sell"}

    # a second call refreshes: the old pair is cancelled, a new pair stands
    second = client.post(
        f"/api/v1/stocks/{setup['ticker']}/quotes",
        json={"quantity": 5},
        headers=_headers(maker["token"]),
    )
    assert second.status_code == 200, second.get_data(as_text=True)
    orders = _open_orders(test_dsn, actor_id)
    assert len(orders) == 2
    assert {int(row["quantity"]) for row in orders} == {5}
    del funder


def test_quote_skips_sell_side_without_inventory(client, test_dsn):
    setup = _market_with_momentum(client, test_dsn)
    maker = _player(client, "mm-empty")
    _fund = __import__("tests.integration.test_ai_economy", fromlist=["_fund"])._fund
    _fund(test_dsn, maker["id"], "cc4", "5000")

    response = client.post(
        f"/api/v1/stocks/{setup['ticker']}/quotes",
        json={"quantity": 3},
        headers=_headers(maker["token"]),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    body = response.get_json()["data"]
    assert "buy" in body["orders"]
    assert body["skipped"].get("sell") == "no_inventory"


def test_quote_without_listing_is_404(client, test_dsn):
    player = _player(client, "mm-nope")
    response = client.post(
        "/api/v1/stocks/NOPE/quotes", json={}, headers=_headers(player["token"])
    )
    assert response.status_code == 404
