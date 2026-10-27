"""Currency ledger and bank endpoints: balances, exchange, deposits, loans.

Integration tests; they need ``ATLAS_TEST_DATABASE_URL`` like the rest of the
suite. Every case checks the ledger as well as the API response, because a
balance that moves without a balanced transaction is the bug this domain
exists to prevent.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import banks as bank_repo
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _headers(token: str, key: str | None = None) -> dict[str, str]:
    headers = bearer(token)
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _player(client, device: str = "currency-device-1") -> dict:
    data = guest(client, device_id=device)
    return {"token": data["access_token"], "id": data["player"]["id"]}


def _fund(dsn: str, player_id: str, code: str, amount: str) -> None:
    """Grant currency from treasury so tests do not depend on rewards/jobs."""
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


def _balance(dsn: str, player_id: str) -> dict[str, Decimal]:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        rows = currency_repo.balances(conn, actor["id"])
    return {row["currency_code"]: Decimal(row["balance"]) for row in rows}


def _bank(dsn: str, code: str = "test-bank") -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        existing = bank_repo.by_code(conn, code)
        if existing:
            return str(existing["id"])
        row = bank_repo.create(conn, code=code, name="测试银行")
    return str(row["id"])


def _tx_balanced(dsn: str, tx_id: str) -> tuple[Decimal, Decimal]:
    """Return (per-currency max imbalance, q1-equivalent imbalance) for a tx."""
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        rows = conn.execute(
            """
            SELECT e.currency_code, SUM(e.delta) AS delta, c.base_value
              FROM currency_ledger_entries e
              JOIN currencies c ON c.code = e.currency_code
             WHERE e.tx_id = %s
             GROUP BY e.currency_code, c.base_value
            """,
            (tx_id,),
        ).fetchall()
    per_currency = max((abs(row["delta"]) for row in rows), default=Decimal(0))
    q1 = abs(sum((row["delta"] * row["base_value"] for row in rows), Decimal(0)))
    return per_currency, q1


def test_wallet_is_created_on_first_touch(client, test_dsn):
    player = _player(client)
    response = client.get("/api/v1/wallet/currencies", headers=bearer(player["token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    assert data["q1_total"] == "0.0000"
    assert data["currencies"] == []

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player["id"])
    assert actor is not None
    assert actor["kind"] == "player"
    assert actor["controller"] == "human"


def test_exchange_up_burns_tier_fee_and_keeps_q1_balance(client, test_dsn):
    player = _player(client, "currency-device-2")
    _fund(test_dsn, player["id"], "cc1", "1000")

    response = client.post(
        "/api/v1/bank/exchange",
        json={"from_code": "cc1", "to_code": "cc2", "amount": "1000", "direction": "up"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    # <=1000 Q1 走 6% 档：手续费 60，净 940，按 5:1 得 188 cc2。
    assert data["fee"] == "60.0000"
    assert data["received"] == "188.0000"

    balances = _balance(test_dsn, player["id"])
    assert balances.get("cc1", Decimal(0)) == 0
    assert balances["cc2"] == Decimal("188.0000")

    per_currency, q1 = _tx_balanced(test_dsn, data["tx_id"])
    assert q1 < Decimal("0.01")  # 兑换按 Q1 等值平衡
    assert per_currency > 0  # 单币种不平时正常的：价值跨币种转移


def test_transfer_requires_high_tier_and_moves_money(client, test_dsn):
    sender = _player(client, "currency-device-3")
    receiver = _player(client, "currency-device-4")
    _fund(test_dsn, receiver["id"], "cc4", "1")
    _fund(test_dsn, sender["id"], "cc1", "100")
    _fund(test_dsn, sender["id"], "cc4", "10")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        target = currency_repo.actor_for_player(conn, receiver["id"])

    low = client.post(
        "/api/v1/wallet/transfer",
        json={"to_actor_id": str(target["id"]), "currency_code": "cc1", "amount": "10"},
        headers=_headers(sender["token"], str(uuid.uuid4())),
    )
    assert low.status_code == 400, low.get_data(as_text=True)

    ok = client.post(
        "/api/v1/wallet/transfer",
        json={"to_actor_id": str(target["id"]), "currency_code": "cc4", "amount": "4"},
        headers=_headers(sender["token"], str(uuid.uuid4())),
    )
    assert ok.status_code == 200, ok.get_data(as_text=True)
    tx_id = ok.get_json()["data"]["tx_id"]

    assert _balance(test_dsn, sender["id"])["cc4"] == Decimal("6.0000")
    assert _balance(test_dsn, receiver["id"])["cc4"] == Decimal("5.0000")
    per_currency, _ = _tx_balanced(test_dsn, tx_id)
    assert per_currency == 0

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT amount, currency_code FROM currency_transfers WHERE tx_id = %s", (tx_id,)
        ).fetchone()
    assert row["currency_code"] == "cc4"
    assert Decimal(row["amount"]) == Decimal("4.0000")


def test_deposit_and_withdraw_roundtrip_is_idempotent(client, test_dsn):
    player = _player(client, "currency-device-5")
    _fund(test_dsn, player["id"], "cc1", "500")
    bank_id = _bank(test_dsn)

    key = str(uuid.uuid4())
    body = {"currency_code": "cc1", "amount": "300"}
    first = client.post(f"/api/v1/banks/{bank_id}/deposit", json=body, headers=_headers(player["token"], key))
    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json()["data"]["balance"] == "300.0000"

    replay = client.post(f"/api/v1/banks/{bank_id}/deposit", json=body, headers=_headers(player["token"], key))
    assert replay.status_code == 200
    assert replay.headers.get("Idempotent-Replay") == "true"
    assert replay.get_json()["data"]["tx_id"] == first.get_json()["data"]["tx_id"]

    assert _balance(test_dsn, player["id"])["cc1"] == Decimal("200.0000")

    withdraw = client.post(
        f"/api/v1/banks/{bank_id}/withdraw",
        json={"currency_code": "cc1", "amount": "120"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert withdraw.status_code == 200, withdraw.get_data(as_text=True)
    assert withdraw.get_json()["data"]["balance"] == "180.0000"
    assert _balance(test_dsn, player["id"])["cc1"] == Decimal("320.0000")

    accounts = client.get("/api/v1/bank/accounts", headers=bearer(player["token"])).get_json()["data"]
    assert accounts["accounts"][0]["balance"] == "180.0000"


def test_loan_issues_new_money_and_repays(client, test_dsn):
    player = _player(client, "currency-device-6")
    _fund(test_dsn, player["id"], "cc1", "1000")
    bank_id = _bank(test_dsn, "test-bank-loan")

    deposit = client.post(
        f"/api/v1/banks/{bank_id}/deposit",
        json={"currency_code": "cc1", "amount": "1000"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert deposit.status_code == 200, deposit.get_data(as_text=True)

    loan = client.post(
        f"/api/v1/banks/{bank_id}/loans",
        json={"currency_code": "cc1", "amount": "100", "term_days": 90},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert loan.status_code == 200, loan.get_data(as_text=True)
    loan_data = loan.get_json()["data"]
    assert loan_data["outstanding"] == "100.0000"
    assert loan_data["rate_bps"] > 0
    assert _balance(test_dsn, player["id"])["cc1"] == Decimal("100.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        equity = currency_service.system_actor(conn, currency_service.BANK_EQUITY)
        equity_balance = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = 'cc1'",
            (equity["id"],),
        ).fetchone()
    assert Decimal(equity_balance["balance"]) == Decimal("-100.0000")

    repay = client.post(
        f"/api/v1/bank/loans/{loan_data['id']}/repay",
        json={"amount": "100"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert repay.status_code == 200, repay.get_data(as_text=True)
    assert repay.get_json()["data"]["status"] == "repaid"
    assert _balance(test_dsn, player["id"])["cc1"] == Decimal("0.0000")


def test_overdraft_is_rejected_without_partial_entries(client, test_dsn):
    player = _player(client, "currency-device-7")
    _fund(test_dsn, player["id"], "cc1", "50")
    bank_id = _bank(test_dsn, "test-bank-overdraft")

    response = client.post(
        f"/api/v1/banks/{bank_id}/deposit",
        json={"currency_code": "cc1", "amount": "80"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert response.status_code in (409, 422), response.get_data(as_text=True)
    assert _balance(test_dsn, player["id"])["cc1"] == Decimal("50.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        orphan = conn.execute(
            """
            SELECT COUNT(*) AS n FROM currency_ledger_entries e
             WHERE e.actor_id = (SELECT id FROM economic_actors WHERE player_id = %s)
               AND e.delta < 0
            """,
            (player["id"],),
        ).fetchone()
    assert int(orphan["n"]) == 0


def test_exchange_down_keeps_spread_in_market_account(client, test_dsn):
    player = _player(client, "currency-device-8")
    _fund(test_dsn, player["id"], "cc2", "10")

    response = client.post(
        "/api/v1/bank/exchange",
        json={"from_code": "cc2", "to_code": "cc1", "amount": "10", "direction": "down"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    assert data["received"] == "46.0000"  # 1:4.60
    assert data["spread"] == "0.8000"  # 8% 点差归市场账户

    balances = _balance(test_dsn, player["id"])
    assert balances["cc1"] == Decimal("46.0000")
    assert balances.get("cc2", Decimal(0)) == Decimal("0.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        market = currency_service.system_actor(conn, currency_service.MARKET)
        row = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = 'cc2'",
            (market["id"],),
        ).fetchone()
    assert Decimal(row["balance"]) == Decimal("0.8000")

    _, q1 = _tx_balanced(test_dsn, data["tx_id"])
    assert q1 < Decimal("0.01")


def test_interest_accrual_capitalises_on_the_loan(client, test_dsn):
    from server.domain import bank_service

    player = _player(client, "currency-device-9")
    _fund(test_dsn, player["id"], "cc1", "1000")
    bank_id = _bank(test_dsn, "test-bank-interest")

    client.post(
        f"/api/v1/banks/{bank_id}/deposit",
        json={"currency_code": "cc1", "amount": "1000"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    loan = client.post(
        f"/api/v1/banks/{bank_id}/loans",
        json={"currency_code": "cc1", "amount": "100", "term_days": 30},
        headers=_headers(player["token"], str(uuid.uuid4())),
    ).get_json()["data"]

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        result = bank_service.accrue_interest(conn)
    assert result["loans"] == 1
    assert Decimal(result["interest"]) > 0

    loans = client.get("/api/v1/bank/loans", headers=bearer(player["token"])).get_json()["data"]["loans"]
    assert Decimal(loans[0]["accrued_interest"]) > 0
    assert loans[0]["principal"] == loan["principal"]


def test_daily_issuance_is_clamped_and_runs_once(client, test_dsn):
    from server.jobs import tasks

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        first = tasks.currency_issuance_tick(conn)
        second = tasks.currency_issuance_tick(conn)

    assert Decimal(first["emitted"]) >= Decimal("5000")  # 下限
    assert Decimal(first["emitted"]) <= Decimal("250000")  # 上限
    assert second["skipped"] == "already_issued"

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute("SELECT emitted_amount, raw_amount FROM currency_issuance").fetchone()
        treasury = currency_service.system_actor(conn, "treasury")
        account = conn.execute(
            "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = 'cc1'",
            (treasury["id"],),
        ).fetchone()
    assert Decimal(row["emitted_amount"]) == Decimal(first["emitted"])
    # 发行只把 30% 划给央行，财政净减少 0.3×发行额，剩余 70% 是奖励预算
    assert Decimal(account["balance"]) == -Decimal(first["emitted"]) * Decimal("0.3")


def test_currency_reconciliation_finds_no_unbalanced_transactions(client, test_dsn):
    from server.jobs import tasks

    player = _player(client, "currency-device-10")
    _fund(test_dsn, player["id"], "cc1", "1000")
    client.post(
        "/api/v1/bank/exchange",
        json={"from_code": "cc1", "to_code": "cc2", "amount": "1000", "direction": "up"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        result = tasks.reconcile_currency(conn)
    assert result["transactions"] >= 2
    assert result["unbalanced"] == []


def _active_bank(dsn: str, code: str) -> str:
    bank_id = _bank(dsn, code)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE banks SET status = 'active' WHERE id = %s", (bank_id,))
    return bank_id


def test_certificate_issue_transfer_and_redeem(client, test_dsn):
    seller = _player(client, "cert-device-1")
    buyer = _player(client, "cert-device-2")
    _fund(test_dsn, seller["id"], "cc1", "1000")
    _fund(test_dsn, buyer["id"], "cc1", "1000")
    bank_id = _active_bank(test_dsn, "cert-bank")

    issued = client.post(
        f"/api/v1/banks/{bank_id}/certificates",
        json={"currency_code": "cc1", "amount": "500", "term_days": 90},
        headers=_headers(seller["token"], str(uuid.uuid4())),
    )
    assert issued.status_code == 200, issued.get_data(as_text=True)
    cert = issued.get_json()["data"]
    assert cert["principal"] == "500.0000"
    assert cert["rate_bps"] > 0
    assert _balance(test_dsn, seller["id"])["cc1"] == Decimal("500.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        from server.domain import certificate_service

        accrued = certificate_service.accrue_all(conn)
    assert accrued["certificates"] == 1

    quote = client.post(
        f"/api/v1/bank/certificates/{cert['id']}/quote",
        json={"ask_yield_bps": 300},
        headers=_headers(seller["token"], str(uuid.uuid4())),
    )
    assert quote.status_code == 200, quote.get_data(as_text=True)
    quote_id = quote.get_json()["data"]["quote_id"]

    bought = client.post(
        f"/api/v1/bank/certificate-quotes/{quote_id}/buy",
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert bought.status_code == 200, bought.get_data(as_text=True)
    assert bought.get_json()["data"]["transfer_count"] == 1

    held = client.get("/api/v1/bank/certificates", headers=bearer(buyer["token"])).get_json()["data"]
    assert [row["id"] for row in held["certificates"]] == [cert["id"]]

    # 到期后兑付
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE deposit_certificates SET matures_at = now() - interval '1 day' WHERE id = %s", (cert["id"],))
    redeemed = client.post(
        f"/api/v1/bank/certificates/{cert['id']}/redeem",
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert redeemed.status_code == 200, redeemed.get_data(as_text=True)
    assert redeemed.get_json()["data"]["status"] == "redeemed"
    assert _balance(test_dsn, buyer["id"])["cc1"] > Decimal("0")


def test_interbank_order_accept_and_repay(client, test_dsn):
    from server.domain import interbank_service

    lender = _active_bank(test_dsn, "ib-lender")
    borrower = _active_bank(test_dsn, "ib-borrower")

    # 用玩家存款给拆出银行注资
    player = _player(client, "ib-device")
    _fund(test_dsn, player["id"], "cc1", "2200")
    for bank, amount in ((lender, "2000"), (borrower, "200")):
        client.post(
            f"/api/v1/banks/{bank}/deposit",
            json={"currency_code": "cc1", "amount": amount},
            headers=_headers(player["token"], str(uuid.uuid4())),
        )

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        order = interbank_service.post_order(
            conn, lender_bank_id=lender, currency_code="cc1", principal=Decimal("500"),
            rate_bps=300, term_days=7,
        )
        accepted = interbank_service.accept(conn, borrower_bank_id=borrower, order_id=order["id"])
        repaid = interbank_service.repay(conn, borrower_bank_id=borrower, order_id=order["id"])

    assert accepted["status"] == "accepted"
    assert repaid["status"] == "repaid"
    assert Decimal(repaid["interest"]) > 0

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute("SELECT status FROM interbank_loans WHERE id = %s", (order["id"],)).fetchone()
    assert row["status"] == "repaid"


def test_insurance_claim_requires_three_of_four_approvals(client, test_dsn):
    from server.domain import insurance_service

    bank_id = _active_bank(test_dsn, "ins-bank")
    player = _player(client, "ins-device")
    _fund(test_dsn, player["id"], "cc1", "12000")
    client.post(
        f"/api/v1/banks/{bank_id}/deposit",
        json={"currency_code": "cc1", "amount": "12000"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        insurance_service.collect_premium(conn, bank_id=bank_id, currency_code="cc1", amount=Decimal("10000"))

    claim = client.post(
        "/api/v1/bank/insurance/claims",
        json={"bank_id": bank_id, "currency_code": "cc1", "amount": "12000"},
        headers=_headers(player["token"], str(uuid.uuid4())),
    )
    assert claim.status_code == 200, claim.get_data(as_text=True)
    claim_data = claim.get_json()["data"]
    assert claim_data["cap_applied"] == "10000.0000"  # 单 actor 上限

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        first = insurance_service.decide(conn, claim_id=claim_data["id"], approver="cb:1")
        assert first["status"] == "pending"
        second = insurance_service.decide(conn, claim_id=claim_data["id"], approver="ccmc:1")
        assert second["status"] == "pending"
        third = insurance_service.decide(conn, claim_id=claim_data["id"], approver="cb:2")
        assert third["status"] == "approved"
        paid = insurance_service.pay(conn, claim_id=claim_data["id"])

    assert paid["status"] == "paid"
    assert Decimal(paid["paid"]) == Decimal("10000.0000")


def test_bribe_is_closed_by_default_and_capped_when_enabled(client, test_dsn):
    from server.domain import compliance_service

    bank_id = _active_bank(test_dsn, "bribe-bank")
    player = _player(client, "bribe-device")
    _fund(test_dsn, player["id"], "cc1", "1000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        officer_actor = conn.execute(
            """
            INSERT INTO economic_actors (code, kind, controller, display_name)
            VALUES ('officer:test', 'officer', 'system', '测试柜员')
            ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name
            RETURNING id
            """
        ).fetchone()
        from server.repo import banks as bank_repo

        bank_repo.insert_officer(conn, bank_id=str(bank_id), actor_id=str(officer_actor["id"]), display_name="测试柜员")
        actor = currency_repo.actor_for_player(conn, player["id"])

        try:
            compliance_service.pay_bribe(
                conn, actor=actor, officer_actor_id=str(officer_actor["id"]), currency_code="cc1",
                bribe_amount=Decimal("50"), base_fee_q1=Decimal("100"),
            )
            raise AssertionError("bribe should be rejected while disabled")
        except Exception as exc:  # noqa: BLE001
            assert "关闭" in str(exc)

        conn.execute("UPDATE currency_issuance_policy SET bribe_enabled = true WHERE status = 'active'")
        try:
            compliance_service.pay_bribe(
                conn, actor=actor, officer_actor_id=str(officer_actor["id"]), currency_code="cc1",
                bribe_amount=Decimal("300"), base_fee_q1=Decimal("100"),
            )
            raise AssertionError("bribe above 2x base fee must be rejected")
        except Exception as exc:  # noqa: BLE001
            assert "2 倍" in str(exc) or "2倍" in str(exc)

        event = compliance_service.pay_bribe(
            conn, actor=actor, officer_actor_id=str(officer_actor["id"]), currency_code="cc1",
            bribe_amount=Decimal("150"), base_fee_q1=Decimal("100"),
        )
        assert event["bribe_q1"] == "150.0000"

        fined = compliance_service.fine(conn, actor_id=str(officer_actor["id"]), currency_code="cc1",
                                        amount=Decimal("50"), ref_type="bribe")
        assert Decimal(fined["fund_balance"]) > 0

        try:
            compliance_service.seize_officer(conn, officer_actor_id=str(officer_actor["id"]), approvals=["cb:1"])
            raise AssertionError("single approver must be rejected")
        except Exception as exc:  # noqa: BLE001
            assert "两名" in str(exc)

        seized = compliance_service.seize_officer(
            conn, officer_actor_id=str(officer_actor["id"]), approvals=["cb:1", "ccmc:1"]
        )
        assert seized["moved"], "officer balance should be recovered"
