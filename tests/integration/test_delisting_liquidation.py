"""Delisting: consolidation window, clearing price, liquidation payouts (T-22)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service, stock_service
from server.domain.currency_service import Move
from tests.helpers import bearer
from tests.integration.test_stock_market import _ipo, _order


def _conn(dsn: str):
    return psycopg.connect(dsn, row_factory=dict_row)


def _trigger(dsn: str, ticker: str) -> None:
    """Negative book value is the deterministic delisting trigger (05 §7.3)."""
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE companies SET book_value = -1 WHERE ticker = %s", (ticker,))
        stock_service.daily_tick(conn)


def _case(dsn: str, ticker: str) -> dict:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT c.* FROM delisting_cases c "
            "  JOIN stock_listings l ON l.id = c.listing_id "
            " WHERE l.ticker = %s ORDER BY c.triggered_at DESC LIMIT 1",
            (ticker,),
        ).fetchone()


def _fund_company(dsn: str, ticker: str, amount: str, code: str = "cc4") -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT treasury_actor_id FROM companies WHERE ticker = %s", (ticker,)
        ).fetchone()
        system_treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[
                Move(str(system_treasury["id"]), code, -Decimal(amount)),
                Move(str(row["treasury_actor_id"]), code, Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )
    return str(row["treasury_actor_id"])


def _balance(dsn: str, actor_id: str, code: str = "cc4") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = %s",
            (actor_id, code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _shares(dsn: str, ticker: str, actor_id: str) -> int:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT h.shares FROM stock_holders h JOIN stock_listings l ON l.id = h.listing_id "
            "WHERE l.ticker = %s AND h.actor_id = %s",
            (ticker, actor_id),
        ).fetchone()
    return int(row["shares"]) if row else 0


def _settle(dsn: str, ticker: str) -> dict:
    with _conn(dsn) as conn:
        result = stock_service.settle_delisting(conn, ticker)
        conn.commit()
    return result


def test_trigger_opens_a_consolidation_window_that_still_trades(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="OMEG1", device="dl1")
    _trigger(test_dsn, "OMEG1")

    status = client.get(
        "/api/v1/stocks/OMEG1/delisting", headers=bearer(ipo["founder"]["token"])
    ).get_json()["data"]
    assert status["status"] == "listed"
    assert status["case"]["status"] == "consolidation"
    assert status["case"]["consolidation_ends_at"] is not None
    assert status["case"]["auction_ends_at"] is None

    # 整理期的意义就是还能走：持有人仍然可以卖出。
    sold = _order(
        client, ipo["founder"]["token"], "OMEG1", side="sell", quantity=10, price="10"
    )
    assert sold.status_code == 200, sold.get_data(as_text=True)


def test_window_expiry_moves_to_auction_and_stops_the_book(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="OMEG2", device="dl2")
    _trigger(test_dsn, "OMEG2")
    with psycopg.connect(test_dsn, autocommit=True) as conn:
        conn.execute(
            "UPDATE delisting_cases SET consolidation_ends_at = now() - interval '1 minute' "
            "WHERE listing_id = (SELECT id FROM stock_listings WHERE ticker = 'OMEG2')"
        )
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        result = stock_service.advance_delisting(conn)
    assert result["to_auction"] == 1

    status = client.get(
        "/api/v1/stocks/OMEG2/delisting", headers=bearer(ipo["founder"]["token"])
    ).get_json()["data"]
    assert status["status"] == "suspended"
    assert status["case"]["status"] == "auction"
    assert status["case"]["auction_ends_at"] is not None

    blocked = _order(
        client, ipo["founder"]["token"], "OMEG2", side="sell", quantity=10, price="10"
    )
    assert blocked.status_code == 422


def test_clearing_distributes_treasury_cash_to_holders(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="OMEG3", device="dl3")
    founder_actor = _fund_company(test_dsn, "OMEG3", "1000")  # returns treasury, unused below
    assert founder_actor
    _trigger(test_dsn, "OMEG3")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        account = conn.execute(
            "SELECT id FROM economic_actors WHERE player_id = %s",
            (ipo["founder"]["id"],),
        ).fetchone()
    founder_id = str(account["id"])
    before = _balance(test_dsn, founder_id)
    shares_before = _shares(test_dsn, "OMEG3", founder_id)
    assert shares_before > 0

    # Clearing price falls back to the IPO price when the window never traded.
    result = _settle(test_dsn, "OMEG3")
    assert result["status"] == "settled"
    assert Decimal(result["clearing_price"]) == Decimal("10")
    assert Decimal(result["distributed"]) == Decimal("1000")

    # The founder is the only real holder, so the whole treasury lands there.
    assert _balance(test_dsn, founder_id) - before == Decimal("1000")
    assert _shares(test_dsn, "OMEG3", founder_id) == 0

    case = _case(test_dsn, "OMEG3")
    assert case["status"] == "settled"
    assert Decimal(case["clearing_price"]) == Decimal("10")
    assert Decimal(case["distributed_amount"]) == Decimal("1000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        payouts = conn.execute(
            "SELECT kind, actor_id, amount FROM stock_delisting_payouts WHERE case_id = %s",
            (str(case["id"]),),
        ).fetchall()
    assert len(payouts) == 1
    assert payouts[0]["kind"] == "shareholder"
    assert str(payouts[0]["actor_id"]) == founder_id

    listing = client.get(
        "/api/v1/stocks/OMEG3/delisting", headers=bearer(ipo["founder"]["token"])
    ).get_json()["data"]
    assert listing["status"] == "delisted"
    assert listing["case"] is None  # the case is closed, so it is no longer "current"


def test_clearing_with_an_empty_treasury_kills_the_shares_anyway(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="OMEG4", device="dl4")
    _trigger(test_dsn, "OMEG4")
    result = _settle(test_dsn, "OMEG4")
    assert result["status"] == "settled"
    assert Decimal(result["distributed"]) == Decimal("0")

    status = client.get(
        "/api/v1/stocks/OMEG4/delisting", headers=bearer(ipo["founder"]["token"])
    ).get_json()["data"]
    assert status["status"] == "delisted"


def test_a_delisted_ticker_cannot_be_traded(client, test_dsn):
    ipo = _ipo(client, test_dsn, ticker="OMEG5", device="dl5")
    _trigger(test_dsn, "OMEG5")
    _settle(test_dsn, "OMEG5")
    blocked = _order(
        client, ipo["founder"]["token"], "OMEG5", side="sell", quantity=1, price="10"
    )
    assert blocked.status_code == 422
