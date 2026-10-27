"""M4 market and contracts: prices, stock, trades, progress and claims."""

from __future__ import annotations

import uuid

import psycopg

from pymodules.__planet_elements import planet_identity
from tests.helpers import bearer, guest


def _planet_key(dsn: str) -> str:
    with psycopg.connect(dsn, autocommit=True) as conn:
        seed = int(conn.execute("SELECT seed FROM universes WHERE seed_name = 'atlas-main'").fetchone()[0])
    identity = planet_identity(seed, 1, 2, 3, 0, 0)
    return f"planet_1,2,3_0_{identity['name']}"


def _headers(token: str, key: str | None = None) -> dict[str, str]:
    headers = bearer(token)
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _grant(db_conn, player_id: str, code: str, amount: int) -> None:
    db_conn.execute(
        "UPDATE wallets SET balance = balance + %s WHERE player_id = %s AND resource_code = %s",
        (amount, player_id, code),
    )


def _market(client, token, key):
    return client.get(f"/api/v1/planets/{key}/market", headers=bearer(token))


def _buy(client, token, key, code, quantity, idem=None):
    return client.post(
        f"/api/v1/planets/{key}/market/buy",
        json={"resource_code": code, "quantity": quantity},
        headers=_headers(token, idem or str(uuid.uuid4())),
    )


def _sell(client, token, key, code, quantity, idem=None):
    return client.post(
        f"/api/v1/planets/{key}/market/sell",
        json={"resource_code": code, "quantity": quantity},
        headers=_headers(token, idem or str(uuid.uuid4())),
    )


def test_market_quotes_are_daily_and_stable(client, test_dsn):
    data = guest(client)
    key = _planet_key(test_dsn)
    first = _market(client, data["access_token"], key)
    assert first.status_code == 200, first.get_data(as_text=True)
    body = first.get_json()["data"]
    assert len(body["quotes"]) == 3
    assert all(quote["buy_price"] > 0 and quote["sell_price"] > 0 for quote in body["quotes"])
    assert all(quote["stock"] >= 1 for quote in body["quotes"])

    second = _market(client, data["access_token"], key).get_json()["data"]
    assert second["quotes"] == body["quotes"]


def test_market_buy_sell_replay_and_ledger(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = _planet_key(test_dsn)
    player_id = data["player"]["id"]
    _grant(db_conn, player_id, "antimatter", 10000)

    quotes = _market(client, token, key).get_json()["data"]["quotes"]
    quote = quotes[0]
    idem = str(uuid.uuid4())
    bought = _buy(client, token, key, quote["resource_code"], 2, idem)
    assert bought.status_code == 200, bought.get_data(as_text=True)
    payload = bought.get_json()["data"]
    assert payload["total"] == quote["buy_price"] * 2
    assert payload["balances"]["antimatter"] == 10000 - payload["total"]

    replay = _buy(client, token, key, quote["resource_code"], 2, idem)
    assert replay.status_code == 200
    assert replay.headers.get("Idempotent-Replay") == "true"
    assert replay.get_json()["data"]["tx_id"] == payload["tx_id"]

    after = _market(client, token, key).get_json()["data"]["quotes"]
    remaining = next(item for item in after if item["resource_code"] == quote["resource_code"])
    assert remaining["stock"] == quote["stock"] - 2

    sold = _sell(client, token, key, quote["resource_code"], 2)
    assert sold.status_code == 200, sold.get_data(as_text=True)
    assert sold.get_json()["data"]["total"] == quote["sell_price"] * 2

    rows = db_conn.execute(
        "SELECT transaction_id, SUM(delta) AS total FROM ledger_entries GROUP BY transaction_id"
    ).fetchall()
    assert rows and all(row[1] == 0 for row in rows)
    orders = db_conn.execute("SELECT side FROM trade_orders ORDER BY id").fetchall()
    assert [row[0] for row in orders] == ["buy", "sell"]


def test_market_rejects_bad_orders(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = _planet_key(test_dsn)
    quote = _market(client, token, key).get_json()["data"]["quotes"][0]

    broke = _buy(client, token, key, quote["resource_code"], 1)
    assert broke.status_code == 409
    assert broke.get_json()["code"] == "insufficient_funds"

    _grant(db_conn, data["player"]["id"], "antimatter", 100000)
    too_many = _buy(client, token, key, quote["resource_code"], 9999)
    assert too_many.status_code == 409
    assert too_many.get_json()["code"] == "out_of_stock"


def test_contract_accept_progress_claim(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = _planet_key(test_dsn)
    player_id = data["player"]["id"]
    _grant(db_conn, player_id, "antimatter", 100000)

    items = client.get("/api/v1/contracts", headers=bearer(token)).get_json()["data"]["contracts"]
    assert 3 <= len(items) <= 4
    trade = next(item for item in items if item["template"] == "trade_escort")
    if trade["taken_by"]:
        db_conn.execute(
            "UPDATE contracts SET taken_by = NULL WHERE player_id = %s AND id = %s",
            (player_id, trade["id"]),
        )

    accepted = client.post(
        f"/api/v1/contracts/{trade['id']}/accept",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert accepted.status_code == 200, accepted.get_data(as_text=True)

    quote = _market(client, token, key).get_json()["data"]["quotes"][0]
    db_conn.execute(
        "UPDATE market_quotes SET stock = 9999 WHERE resource_code = %s",
        (quote["resource_code"],),
    )
    for _ in range(int(trade["target"])):
        assert _buy(client, token, key, quote["resource_code"], 1).status_code == 200

    progressed = client.get("/api/v1/contracts", headers=bearer(token)).get_json()["data"]["contracts"]
    current = next(item for item in progressed if item["id"] == trade["id"])
    assert current["progress"] >= trade["target"]

    claimed = client.post(
        f"/api/v1/contracts/{trade['id']}/claim",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert claimed.status_code == 200, claimed.get_data(as_text=True)
    reward = claimed.get_json()["data"]["reward"]
    assert reward
    assert all(amount >= 1 for amount in reward.values())

    again = client.post(
        f"/api/v1/contracts/{trade['id']}/claim",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert again.status_code == 409
    assert again.get_json()["code"] == "already_claimed"


def test_contract_expired_and_voucher(client, test_dsn, db_conn):
    data = guest(client)
    token = data["access_token"]
    player_id = data["player"]["id"]

    db_conn.execute(
        """
        INSERT INTO contracts (player_id, id, template_code, metric, target, progress, status,
                               game_day, reward, target_distance, reward_multiplier, accepted_at, expires_at)
        VALUES (%s, 'expired-test', 'deep_patrol', 'scans', 1, 0, 'accepted',
                current_date, '{"antimatter": 220}'::jsonb, 0, 1, now(), now() - interval '1 hour')
        ON CONFLICT (player_id, id) DO NOTHING
        """,
        (player_id,),
    )
    expired = client.post(
        "/api/v1/contracts/expired-test/claim",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert expired.status_code == 409
    assert expired.get_json()["code"] == "contract_expired"

    db_conn.execute(
        """
        INSERT INTO contracts (player_id, id, template_code, metric, target, progress, status,
                               game_day, reward, target_distance, reward_multiplier, accepted_at, expires_at)
        VALUES (%s, 'voucher-test', 'relic_survey', 'relicScans', 1, 1, 'accepted',
                current_date, '{"exoticCrystal": 6}'::jsonb, 0, 1, now(), now() + interval '1 hour')
        ON CONFLICT (player_id, id) DO NOTHING
        """,
        (player_id,),
    )
    claimed = client.post(
        "/api/v1/contracts/voucher-test/claim",
        json={},
        headers=_headers(token, str(uuid.uuid4())),
    )
    assert claimed.status_code == 200, claimed.get_data(as_text=True)
    assert claimed.get_json()["data"]["vouchers"] == 1
    vouchers = db_conn.execute(
        "SELECT vouchers FROM player_flags WHERE player_id = %s", (player_id,)
    ).fetchone()[0]
    assert vouchers == 1
