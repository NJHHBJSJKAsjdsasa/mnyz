"""Capital actions: buyback, issuance and reduction (T-16 / 08 §4).

Governance already accepted these resolution kinds; the point of these tests is
that a *passed* resolution now moves money and shares:

* buyback — treasury pays the holders pro rata; private companies cancel the
  shares, listed ones keep them as treasury stock;
* issuance — a private placement pays the treasury immediately, a public offering
  mints to the treasury and rests an ask at the issue price;
* reduction — pro rata cancellation, refused while the company still owes a bank.

Votes go through the HTTP surface so the resolution wiring is covered too.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import psycopg
import pytest
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import banks as bank_repo
from server.repo import currency as currency_repo
from tests.helpers import bearer
from tests.integration.test_ai_economy import _fund, _headers, _player


def _company(client, test_dsn, device: str, ticker: str) -> dict:
    founder = _player(client, device)
    _fund(test_dsn, founder["id"], "cc3", "300000")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 公司", "shares_total": 100000},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    return founder


def _company_row(test_dsn, ticker: str) -> dict:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT id, treasury_actor_id, shares_total, free_float, founder_actor_id "
            "FROM companies WHERE ticker = %s",
            (ticker,),
        ).fetchone()


def _shares(test_dsn, ticker: str, player_id: str) -> int:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            SELECT h.shares FROM share_holdings h
              JOIN companies c ON c.id = h.company_id
              JOIN economic_actors e ON e.id = h.actor_id
             WHERE c.ticker = %s AND e.player_id = %s
            """,
            (ticker, player_id),
        ).fetchone()
    return int(row["shares"]) if row else 0


def _balance(test_dsn, player_id: str, code: str) -> Decimal:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            SELECT a.balance FROM currency_accounts a
              JOIN economic_actors e ON e.id = a.actor_id
             WHERE e.player_id = %s AND a.currency_code = %s
            """,
            (player_id, code),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _fund_treasury(test_dsn, ticker: str, amount: str) -> None:
    company = _company_row(test_dsn, ticker)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, currency_service.TREASURY)
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[
                Move(treasury["id"], "cc3", -Decimal(amount)),
                Move(str(company["treasury_actor_id"]), "cc3", Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _resolve(client, founder: dict, ticker: str, kind: str, payload: dict) -> dict:
    proposed = client.post(
        f"/api/v1/companies/{ticker}/resolutions",
        json={"kind": kind, "payload": payload},
        headers=_headers(founder["token"]),
    )
    assert proposed.status_code == 200, proposed.get_data(as_text=True)
    resolution = proposed.get_json()["data"]
    # The proposer's own shares are already cast; closing is enough for a 100% holder.
    closed = client.post(
        f"/api/v1/companies/resolutions/{resolution['id']}/close",
        json={},
        headers=_headers(founder["token"]),
    )
    return closed


def test_private_placement_moves_cash_and_shares(client, test_dsn):
    founder = _company(client, test_dsn, "capital-1", "CAP1")
    before_cash = _balance(test_dsn, founder["id"], "cc3")
    company = _company_row(test_dsn, "CAP1")
    founder_actor = str(company["founder_actor_id"])

    closed = _resolve(
        client, founder, "CAP1", "issuance",
        {"price": "10", "shares": 20000, "buyer_actor_id": founder_actor},
    )
    assert closed.status_code == 200, closed.get_data(as_text=True)
    applied = closed.get_json()["data"]["applied"]
    assert applied["mode"] == "placement"
    assert applied["raised"] == "200000.0000"
    assert Decimal(applied["shares_total"]) == Decimal("120000")

    assert _shares(test_dsn, "CAP1", founder["id"]) == 120000
    assert _balance(test_dsn, founder["id"], "cc3") == before_cash - Decimal("200000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury_balance = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = 'cc3'",
            (str(company["treasury_actor_id"]),),
        ).fetchone()["balance"]
    assert Decimal(treasury_balance) == Decimal("200000.0000")


def test_private_buyback_pays_the_holder_and_cancels_shares(client, test_dsn):
    founder = _company(client, test_dsn, "capital-2", "CAP2")
    _fund_treasury(test_dsn, "CAP2", "10000")
    before_cash = _balance(test_dsn, founder["id"], "cc3")

    closed = _resolve(client, founder, "CAP2", "buyback", {"price": "5", "shares": 1000})
    assert closed.status_code == 200, closed.get_data(as_text=True)
    applied = closed.get_json()["data"]["applied"]
    assert applied["treasury_stock"] is False
    assert applied["cost"] == "5000.0000"

    assert _shares(test_dsn, "CAP2", founder["id"]) == 99000
    assert Decimal(_company_row(test_dsn, "CAP2")["shares_total"]) == Decimal("99000")
    assert _balance(test_dsn, founder["id"], "cc3") == before_cash + Decimal("5000")


def test_buyback_without_treasury_cash_fails_and_rolls_back(client, test_dsn):
    founder = _company(client, test_dsn, "capital-3", "CAP3")
    closed = _resolve(client, founder, "CAP3", "buyback", {"price": "5", "shares": 1000})

    assert closed.status_code == 422, closed.get_data(as_text=True)
    assert "余额不足" in closed.get_json()["detail"]
    assert _shares(test_dsn, "CAP3", founder["id"]) == 100000
    assert Decimal(_company_row(test_dsn, "CAP3")["shares_total"]) == Decimal("100000")


def test_reduction_pays_out_and_shrinks_the_company(client, test_dsn):
    founder = _company(client, test_dsn, "capital-4", "CAP4")
    _fund_treasury(test_dsn, "CAP4", "10000")
    before_cash = _balance(test_dsn, founder["id"], "cc3")

    closed = _resolve(client, founder, "CAP4", "reduction", {"price": "2", "shares": 5000})
    assert closed.status_code == 200, closed.get_data(as_text=True)
    applied = closed.get_json()["data"]["applied"]
    assert applied["paid_out"] == "10000.0000"

    assert _shares(test_dsn, "CAP4", founder["id"]) == 95000
    assert Decimal(_company_row(test_dsn, "CAP4")["shares_total"]) == Decimal("95000")
    assert _balance(test_dsn, founder["id"], "cc3") == before_cash + Decimal("10000")


def test_reduction_is_refused_while_a_bank_loan_is_outstanding(client, test_dsn):
    founder = _company(client, test_dsn, "capital-5", "CAP5")
    _fund_treasury(test_dsn, "CAP5", "10000")
    company = _company_row(test_dsn, "CAP5")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        bank = bank_repo.create(conn, code=f"cap-bank-{uuid.uuid4().hex[:6]}", name="减资测试行")
        bank_repo.insert_loan(
            conn,
            bank_id=str(bank["id"]),
            actor_id=str(company["treasury_actor_id"]),
            currency_code="cc1",
            principal=Decimal("100"),
            rate_bps=500,
            spread_bps=250,
            rate_type="fixed",
            due_at=datetime.now(timezone.utc) + timedelta(days=30),
        )

    closed = _resolve(client, founder, "CAP5", "reduction", {"price": "2", "shares": 5000})
    assert closed.status_code == 422, closed.get_data(as_text=True)
    assert "银行贷款" in closed.get_json()["detail"]
    assert _shares(test_dsn, "CAP5", founder["id"]) == 100000


def test_resolution_payload_is_validated_before_the_vote(client, test_dsn):
    founder = _company(client, test_dsn, "capital-6", "CAP6")
    response = client.post(
        "/api/v1/companies/CAP6/resolutions",
        json={"kind": "buyback", "payload": {"price": "0", "shares": 1000}},
        headers=_headers(founder["token"]),
    )
    assert response.status_code == 400, response.get_data(as_text=True)


def test_public_issuance_mints_to_treasury_and_rests_an_ask(client, test_dsn):
    founder = _company(client, test_dsn, "capital-7", "CAP7")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE companies SET book_value = 60000, created_at = now() - interval '10 days' "
            "WHERE ticker = 'CAP7'"
        )
    ipo = client.post(
        "/api/v1/stocks/ipo",
        json={"ticker": "CAP7", "price": "10", "offer_shares": 30000},
        headers=_headers(founder["token"]),
    )
    assert ipo.status_code == 200, ipo.get_data(as_text=True)

    closed = _resolve(client, founder, "CAP7", "issuance", {"price": "12", "shares": 5000})
    assert closed.status_code == 200, closed.get_data(as_text=True)
    applied = closed.get_json()["data"]["applied"]
    assert applied["mode"] == "offering"
    assert applied["raised"] == "0.0000"

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        order = conn.execute(
            "SELECT side, price, quantity, status FROM stock_orders WHERE id = %s",
            (applied["offer_order_id"],),
        ).fetchone()
        listing = conn.execute(
            "SELECT total_shares, free_float FROM stock_listings WHERE ticker = 'CAP7'"
        ).fetchone()
    assert order["side"] == "sell" and Decimal(order["price"]) == Decimal("12")
    assert int(order["quantity"]) == 5000 and order["status"] == "open"
    assert int(listing["total_shares"]) == 135000  # 100000 + 30000 IPO + 5000
