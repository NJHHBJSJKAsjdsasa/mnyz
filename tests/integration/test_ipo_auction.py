"""IPO council approval and the first-day call auction (T-21).

Two behaviours are under test:

* an ``ipo`` motion that passes **is** the listing — the council approves the
  parameters, and approval executes them (there is no second call a player could
  skip);
* while ``auction_ends_at`` is in the future, orders rest and nothing matches;
  when the window closes the job prints one price that every fill uses.

Votes are inserted directly for the council test: the AI seats vote with a seeded
RNG, so waiting for four "yes" would make the test flaky by design.
"""

from __future__ import annotations

from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import council_service
from server.infra.context import db
from server.jobs import tasks
from server.repo import council as council_repo
from tests.helpers import bearer
from tests.integration.test_ai_economy import _fund, _headers, _player


def _company(client, test_dsn, device: str, ticker: str, *, book: str = "60000") -> dict:
    founder = _player(client, device)
    _fund(test_dsn, founder["id"], "cc3", "50")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 公司", "shares_total": 100000},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE companies SET book_value = %s, created_at = now() - interval '10 days' "
            "WHERE ticker = %s",
            (Decimal(book), ticker),
        )
    return founder


def _ipo(client, founder: dict, ticker: str, *, price: str = "10", shares: int = 30000,
         auction_minutes: int = 0) -> dict:
    response = client.post(
        "/api/v1/stocks/ipo",
        json={
            "ticker": ticker,
            "price": price,
            "offer_shares": shares,
            "call_auction_minutes": auction_minutes,
        },
        headers=_headers(founder["token"]),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    return response.get_json()["data"]


def _expire_auction(test_dsn, ticker: str) -> None:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE stock_listings SET auction_ends_at = now() - interval '1 minute' "
            "WHERE ticker = %s",
            (ticker,),
        )


def _listing(test_dsn, ticker: str) -> dict:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT last_price, ipo_price, auction_ends_at, auction_cleared_at, "
            "       prev_close FROM stock_listings WHERE ticker = %s",
            (ticker,),
        ).fetchone()


def _run_auction(app) -> dict:
    with app.app_context():
        with db().transaction() as conn:
            return tasks.stock_call_auction_tick(conn)


def _order(client, token: str, ticker: str, side: str, price: str | None, quantity: int,
           order_type: str = "limit") -> dict:
    body: dict = {"side": side, "type": order_type, "quantity": quantity}
    if price is not None:
        body["price"] = price
    return client.post(f"/api/v1/stocks/{ticker}/orders", json=body, headers=_headers(token))


# --------------------------------------------------------------- call auction


def test_orders_rest_during_the_window_and_market_orders_are_rejected(client, test_dsn):
    founder = _company(client, test_dsn, "auction-1", "AUC")
    whale = _player(client, "auction-whale-1")
    _fund(test_dsn, whale["id"], "cc4", "100000")
    _ipo(client, founder, "AUC", auction_minutes=30)

    market = _order(client, whale["token"], "AUC", "buy", None, 10, order_type="market")
    assert market.status_code == 422, market.get_data(as_text=True)

    limit = _order(client, whale["token"], "AUC", "buy", "12", 200)
    assert limit.status_code == 200, limit.get_data(as_text=True)
    body = limit.get_json()["data"]
    assert body["call_auction"] is True
    assert body["trades"] == [] and body["status"] == "open"
    assert _listing(test_dsn, "AUC")["last_price"] == Decimal("10")  # nothing printed yet


def test_clearing_price_is_one_price_for_every_fill(app, client, test_dsn):
    founder = _company(client, test_dsn, "auction-2", "CLR")
    whale = _player(client, "auction-whale-2")
    _fund(test_dsn, whale["id"], "cc4", "100000")
    _ipo(client, founder, "CLR", price="10", shares=30000, auction_minutes=30)

    # 200 @ 12 would pay more under continuous trading; 100 @ 10 is at the money.
    assert _order(client, whale["token"], "CLR", "buy", "12", 200).status_code == 200
    assert _order(client, whale["token"], "CLR", "buy", "10", 100).status_code == 200
    _expire_auction(test_dsn, "CLR")

    result = _run_auction(app)
    assert result["cleared"] == 1
    auction = result["auctions"][0]
    assert auction["clearing_price"] == "10.0000"
    assert auction["matched_volume"] == 300

    row = _listing(test_dsn, "CLR")
    assert row["last_price"] == Decimal("10.0000")
    assert row["auction_cleared_at"] is not None
    assert row["prev_close"] == Decimal("10.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        trades = conn.execute(
            "SELECT price, quantity FROM stock_trades ORDER BY executed_at"
        ).fetchall()
    assert trades and all(Decimal(row["price"]) == Decimal("10.0000") for row in trades)
    assert sum(int(row["quantity"]) for row in trades) == 300


def test_clearing_tie_prefers_the_price_nearest_the_ipo(app, client, test_dsn):
    founder = _company(client, test_dsn, "auction-3", "TIE")
    whale = _player(client, "auction-whale-3")
    _fund(test_dsn, whale["id"], "cc4", "100000")
    _ipo(client, founder, "TIE", price="10", shares=30000, auction_minutes=30)

    # Treasury supply is 30000 @ 10, so every candidate ties on volume at 100.
    assert _order(client, whale["token"], "TIE", "buy", "13", 100).status_code == 200
    _expire_auction(test_dsn, "TIE")

    _run_auction(app)
    # 13 is a valid candidate but 10 is nearer to the IPO price, so 10 wins.
    assert _listing(test_dsn, "TIE")["last_price"] == Decimal("10.0000")


def test_auction_without_orders_clears_at_the_ipo_price(app, client, test_dsn):
    founder = _company(client, test_dsn, "auction-4", "NONE")
    # The IPO itself rests the treasury's 30000 @ 10, so "no orders" means no
    # outside interest: clearing at the IPO price with zero volume.
    _ipo(client, founder, "NONE", price="10", shares=30000, auction_minutes=30)
    _expire_auction(test_dsn, "NONE")

    result = _run_auction(app)
    assert result["auctions"][0]["matched_volume"] == 0
    row = _listing(test_dsn, "NONE")
    assert row["last_price"] == Decimal("10.0000") and row["auction_cleared_at"] is not None


def test_clearing_is_idempotent(app, client, test_dsn):
    founder = _company(client, test_dsn, "auction-5", "ONCE")
    _ipo(client, founder, "ONCE", auction_minutes=30)
    _expire_auction(test_dsn, "ONCE")

    first = _run_auction(app)
    second = _run_auction(app)
    assert first["cleared"] == 1 and second["cleared"] == 0


# ------------------------------------------------------------ council approval


def _pass_motion(app, test_dsn, motion_id: str) -> dict:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        # Overwrite every AI seat: their real votes come from a seeded RNG, so the
        # outcome would otherwise depend on the seed.
        for seat in (1, 2, 3, 4, 5, 6):
            council_repo.add_vote(conn, motion_id, seat, "yes", "测试议员投票")
        conn.execute(
            "UPDATE council_motions SET closes_at = now() - interval '1 minute' WHERE id = %s",
            (motion_id,),
        )
    with app.app_context():
        with db().transaction() as conn:
            return council_service.resolve_due(conn)


def test_council_approved_ipo_lists_automatically(app, client, test_dsn):
    founder = _company(client, test_dsn, "council-ipo-1", "CNL")
    applied = client.post(
        "/api/v1/council/ipo",
        json={"ticker": "CNL", "offer_shares": 30000, "price": "10"},
        headers=_headers(founder["token"]),
    )
    assert applied.status_code == 200, applied.get_data(as_text=True)
    motion = applied.get_json()["data"]["motion"]
    assert motion["kind"] == "ipo" and motion["status"] == "open"

    resolved = _pass_motion(app, test_dsn, motion["id"])
    assert resolved["resolved"] == 1

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT status, outcome_reason, cost FROM council_motions WHERE id = %s",
            (motion["id"],),
        ).fetchone()
        listing = conn.execute(
            "SELECT status, auction_ends_at, auction_cleared_at FROM stock_listings WHERE ticker = 'CNL'"
        ).fetchone()
    assert row["status"] == "passed", row["outcome_reason"]
    assert "CNL" in (row["outcome_reason"] or "")
    assert listing["status"] == "listed"
    # the approved path opens the 30-minute first-day auction by default
    assert listing["auction_ends_at"] is not None and listing["auction_cleared_at"] is None


def test_a_second_live_application_for_the_same_ticker_is_refused(client, test_dsn):
    founder = _company(client, test_dsn, "council-ipo-2", "DUP")
    first = client.post(
        "/api/v1/council/ipo",
        json={"ticker": "DUP", "offer_shares": 30000, "price": "10"},
        headers=_headers(founder["token"]),
    )
    assert first.status_code == 200, first.get_data(as_text=True)

    second = client.post(
        "/api/v1/council/ipo",
        json={"ticker": "DUP", "offer_shares": 10000, "price": "11"},
        headers=_headers(founder["token"]),
    )
    assert second.status_code == 409, second.get_data(as_text=True)


def test_application_is_validated_before_it_reaches_the_council(client, test_dsn):
    founder = _company(client, test_dsn, "council-ipo-3", "BAD")
    # 10000 of 110000 is under the 20% free float the council cannot waive.
    response = client.post(
        "/api/v1/council/ipo",
        json={"ticker": "BAD", "offer_shares": 10000, "price": "10"},
        headers=_headers(founder["token"]),
    )
    assert response.status_code == 422, response.get_data(as_text=True)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        assert conn.execute(
            "SELECT id FROM council_motions WHERE kind = 'ipo' AND cost->>'ticker' = 'BAD'"
        ).fetchall() == []
