"""Reverse-split cash for fractions, adjustment factors and partitioned archive."""

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


def _listed(client, dsn, *, ticker: str, device: str, offer: int = 40000) -> dict:
    founder = _player(client, device)
    _fund_actor(dsn, _actor(dsn, founder["id"]), "cc3", "50")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 拆股测试", "shares_total": 100000},
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
        json={"ticker": ticker, "price": "10", "offer_shares": offer},
        headers=_headers(founder["token"]),
    )
    assert ipo.status_code == 200, ipo.get_data(as_text=True)
    return {"founder": founder, "treasury": treasury}


def _buy(client, dsn, *, ticker: str, device: str, quantity: int,
         price: str = "10") -> dict:
    trader = _player(client, device)
    _fund_actor(dsn, _actor(dsn, trader["id"]), "cc4", "5000")
    bought = client.post(
        f"/api/v1/stocks/{ticker}/orders",
        json={"side": "buy", "type": "limit", "price": price, "quantity": quantity},
        headers=_headers(trader["token"]),
    )
    assert bought.status_code == 200, bought.get_data(as_text=True)
    return trader


def _holding(dsn: str, actor_id: str, ticker: str) -> dict | None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT shares, avg_cost FROM stock_holders WHERE actor_id = %s AND listing_id = "
            "(SELECT id FROM stock_listings WHERE ticker = %s)",
            (actor_id, ticker),
        ).fetchone()


def test_reverse_split_cashes_out_fractional_shares(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="RSP", device="rsp-founder")
    trader = _buy(client, test_dsn, ticker="RSP", device="rsp-trader", quantity=51)
    trader_actor = _actor(test_dsn, trader["id"])
    before_cash = _balance(test_dsn, trader_actor)
    assert int(_holding(test_dsn, trader_actor, "RSP")["shares"]) == 51

    split = client.post(
        "/api/v1/stocks/RSP/split",
        json={"ratio": "0.5"},
        headers=_headers(setup["founder"]["token"]),
    )
    assert split.status_code == 200, split.get_data(as_text=True)
    body = split.get_json()["data"]
    assert Decimal(body["last_price"]) == Decimal("20.0000")   # 10 ÷ 0.5
    # 51 → 25 whole shares, 0.5 share cashed at the post-split price of 20
    assert Decimal(body["cash_in_lieu"]) == Decimal("10.0000")
    assert body["holders_rounded"] == 2   # trader plus the company treasury

    after = _holding(test_dsn, trader_actor, "RSP")
    assert int(after["shares"]) == 25
    assert Decimal(after["avg_cost"]) == Decimal("20.0000")     # 10 ÷ 0.5
    assert _balance(test_dsn, trader_actor) - before_cash == Decimal("10.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT ratio, cash_in_lieu, holders_rounded FROM stock_splits "
            " WHERE listing_id = (SELECT id FROM stock_listings WHERE ticker = 'RSP')"
        ).fetchone()
        listing = conn.execute(
            "SELECT total_shares, free_float FROM stock_listings WHERE ticker = 'RSP'"
        ).fetchone()
    assert Decimal(row["ratio"]) == Decimal("0.5")
    assert Decimal(row["cash_in_lieu"]) == Decimal("10.0000")
    assert int(row["holders_rounded"]) == 2
    # IPO adds the offered shares on top, so 100 000 + 40 000 halves to 70 000
    assert int(listing["total_shares"]) == 70000
    assert int(listing["free_float"]) == 20000


def test_split_factors_describe_every_split(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="FCT", device="fct-founder")
    _buy(client, test_dsn, ticker="FCT", device="fct-trader", quantity=100)

    empty = client.get("/api/v1/stocks/FCT/adjustment-factors",
                       headers=bearer(setup["founder"]["token"]))
    assert empty.status_code == 200
    assert empty.get_json()["data"]["splits"] == []
    assert Decimal(empty.get_json()["data"]["cumulative_factor"]) == Decimal(1)

    for _ in range(2):
        split = client.post(
            "/api/v1/stocks/FCT/split",
            json={"ratio": "2"},
            headers=_headers(setup["founder"]["token"]),
        )
        assert split.status_code == 200, split.get_data(as_text=True)

    factors = client.get("/api/v1/stocks/FCT/adjustment-factors",
                         headers=bearer(setup["founder"]["token"]))
    assert factors.status_code == 200, factors.get_data(as_text=True)
    data = factors.get_json()["data"]
    assert len(data["splits"]) == 2
    # chronological: the older split carries both ratios, the newer only its own
    assert Decimal(data["splits"][0]["factor"]) == Decimal("4")
    assert Decimal(data["splits"][1]["factor"]) == Decimal("2")
    assert Decimal(data["cumulative_factor"]) == Decimal("4")
    assert Decimal(data["last_price"]) == Decimal("2.5000")

    unknown = client.get("/api/v1/stocks/NOPE/adjustment-factors",
                         headers=bearer(setup["founder"]["token"]))
    assert unknown.status_code == 404


def test_archive_partitions_detach_to_cold_and_can_be_restored(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="ARC2", device="arc2-founder")
    admin = _player(client, "arc2-admin")
    _make_admin(test_dsn, admin["id"])
    headers = _headers(admin["token"])

    ensured = client.post(
        "/api/v1/admin/market/archive/partitions",
        json={"months_back": 30, "months_ahead": 2},
        headers=headers,
    )
    assert ensured.status_code == 200, ensured.get_data(as_text=True)
    assert ensured.get_json()["data"]["checked"] == 33

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        listing_id = conn.execute(
            "SELECT id FROM stock_listings WHERE ticker = 'ARC2'"
        ).fetchone()["id"]
        # partitions are anchored at UTC midnight, so ask for the bound the same way
        month = conn.execute(
            "SELECT to_char(date_trunc('month', now() AT TIME ZONE 'UTC') "
            "               - interval '3 months', 'YYYYMM') AS m, "
            "       (date_trunc('month', now() AT TIME ZONE 'UTC') "
            "        - interval '3 months') AT TIME ZONE 'UTC' AS start_at"
        ).fetchone()
    suffix = month["m"]
    hot_name = f"stock_candle_archive_{suffix}"
    cold_name = f"stock_candle_cold_{suffix}"

    # a previous run may have left this month detached; put it back first
    status = client.get("/api/v1/admin/market/archive/partitions", headers=bearer(admin["token"]))
    states = {row["partition"]: row["state"] for row in status.get_json()["data"]["partitions"]}
    if states.get(cold_name) == "cold":
        restored = client.post(
            "/api/v1/admin/market/archive/restore",
            json={"partition": cold_name}, headers=headers,
        )
        assert restored.status_code == 200, restored.get_data(as_text=True)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "INSERT INTO stock_candle_archive (listing_id, interval, bucket_start, open, "
            "high, low, close, volume, quote_volume, trades) "
            "VALUES (%s, '1m', %s, 10, 11, 9, 10.5, 100, 1050, 5) ON CONFLICT DO NOTHING",
            (listing_id, month["start_at"]),
        )

    detached = client.post(
        "/api/v1/admin/market/archive/cold", json={"keep_months": 1}, headers=headers
    )
    assert detached.status_code == 200, detached.get_data(as_text=True)
    names = [row["partition"] for row in detached.get_json()["data"]["detached"]]
    if names:
        assert cold_name in names

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        hot_rows = conn.execute(
            "SELECT COUNT(*) AS n FROM stock_candle_archive "
            " WHERE bucket_start >= %s AND bucket_start < %s + interval '1 month'",
            (month["start_at"], month["start_at"]),
        ).fetchone()["n"]
        cold_rows = conn.execute(f"SELECT COUNT(*) AS n FROM {cold_name}").fetchone()["n"]
        meta = conn.execute(
            "SELECT state, row_count FROM candle_archive_partitions WHERE partition_name = %s",
            (cold_name,),
        ).fetchone()
    assert int(hot_rows) == 0          # the partition is no longer part of the archive
    assert int(cold_rows) == 1
    assert meta["state"] == "cold"
    assert int(meta["row_count"]) == 1

    restored = client.post(
        "/api/v1/admin/market/archive/restore",
        json={"partition": cold_name}, headers=headers,
    )
    assert restored.status_code == 200, restored.get_data(as_text=True)
    assert restored.get_json()["data"]["partition"] == hot_name

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        back = conn.execute(f"SELECT COUNT(*) AS n FROM {hot_name}").fetchone()["n"]
        meta = conn.execute(
            "SELECT state FROM candle_archive_partitions WHERE partition_name = %s",
            (hot_name,),
        ).fetchone()
    assert int(back) == 1
    assert meta["state"] == "hot"

    bad = client.post(
        "/api/v1/admin/market/archive/restore",
        json={"partition": "../../etc/passwd"}, headers=headers,
    )
    assert bad.status_code == 400
    del setup
