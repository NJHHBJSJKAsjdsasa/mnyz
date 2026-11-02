"""Loan collateral: pledge → lien → seizure → auction → proceeds (T-13 steps 2–4).

The ladder itself is covered by ``test_loan_collections.py``. These tests are
about the money: a pledged deed must carry a lien, a default must turn that deed
into a bank-owned auction, and the auction must pay interest first, principal
second, and return the remainder to the borrower (02 §4.3).

Seeding is deliberately split: the *bank* is created through ``bank_repo`` (that
is how production creates one), the *deed* is inserted with raw SQL because
``POST /properties`` is admin-only and registration is not what is under test.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
import pytest
from psycopg.rows import dict_row

from server.domain import bank_service, currency_service, loan_collections, property_service
from server.domain.currency_service import Move
from server.infra.context import db
from server.infra.errors import Forbidden, Unprocessable
from server.repo import banks as bank_repo
from server.repo import currency as currency_repo
from tests.helpers import guest


def _bank(dsn: str, code: str = "collateral-bank") -> tuple[str, str]:
    """Create (or reuse) a bank with a funded vault; returns (bank_id, actor_id)."""
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        existing = bank_repo.by_code(conn, code)
        row = existing or bank_repo.create(conn, code=code, name="抵押测试行")
        bank_repo.adjust_vault(conn, str(row["id"]), "cc1", Decimal("100000"))
    return str(row["id"]), str(row["actor_id"])


def _actor(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    return str(actor["id"])


def _deed(dsn: str, owner_actor_id: str, *, appraised: str = "2000") -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            INSERT INTO property_assets (asset_key, kind, name, owner_actor_id, deed_no,
                                         base_by_type, appraised_value, appraised_at, status)
            VALUES (%s, 'planet', '抵押星', %s, %s, 1000, %s, now(), 'owned')
            RETURNING id
            """,
            (f"lien-{uuid.uuid4().hex[:8]}", owner_actor_id, f"DEED-{uuid.uuid4().hex[:10]}", Decimal(appraised)),
        ).fetchone()
    return str(row["id"])


def _fund(dsn: str, player_id: str, amount: str) -> None:
    actor_id = _actor(dsn, player_id)  # a fresh guest has no economic actor yet
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, currency_service.TREASURY)
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[
                Move(treasury["id"], "cc1", -Decimal(amount)),
                Move(actor_id, "cc1", Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _balance(dsn: str, player_id: str) -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            SELECT a.balance FROM currency_accounts a
              JOIN economic_actors e ON e.id = a.actor_id
             WHERE e.player_id = %s AND a.currency_code = 'cc1'
            """,
            (player_id,),
        ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _open(app, *, actor_id: str, bank_id: str, amount: str, assets: list[str]) -> dict:
    with app.app_context():
        with db().transaction() as conn:
            return bank_service.open_loan(
                conn,
                actor={"id": actor_id},
                bank_id=bank_id,
                currency_code="cc1",
                amount=Decimal(amount),
                term_days=90,
                collateral_asset_ids=assets,
            )


def _tick(app) -> dict:
    with app.app_context():
        with db().transaction() as conn:
            return loan_collections.overdue_tick(conn)


def _age_loan(dsn: str, loan_id: str, *, status: str = "overdue", days: int = -8, interest: str = "50") -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            """
            UPDATE bank_loans
               SET status = %s,
                   due_at = now() + make_interval(days => %s),
                   accrued_interest = %s,
                   last_accrual_at = now()
             WHERE id = %s
            """,
            (status, days, Decimal(interest), loan_id),
        )


def _rows(dsn: str, sql: str, params: tuple) -> list[dict]:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(sql, params).fetchall()


# ------------------------------------------------------------------ pledge


def test_pledging_registers_a_lien_and_the_collateral_row(app, client, test_dsn):
    player = guest(client, device_id="lien-device-1")
    actor_id = _actor(test_dsn, player["player"]["id"])
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, actor_id, appraised="2000")

    loan = _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])

    assert loan["status"] == "active"
    assert [row["asset_id"] for row in loan["collateral"]] == [deed_id]
    assert loan["collateral"][0]["pledged_value"] == "2000.0000"
    liens = _rows(
        test_dsn,
        "SELECT kind, released_at FROM property_encumbrances WHERE asset_id = %s",
        (deed_id,),
    )
    assert len(liens) == 1 and liens[0]["kind"] == "lien" and liens[0]["released_at"] is None


def test_cover_ratio_is_enforced_before_any_money_moves(app, client, test_dsn):
    player = guest(client, device_id="lien-device-2")
    actor_id = _actor(test_dsn, player["player"]["id"])
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, actor_id, appraised="1000")  # 130% of 1000 = 1300 > 1000

    with pytest.raises(Unprocessable):
        _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])

    assert _balance(test_dsn, player["player"]["id"]) == Decimal("0")
    assert _rows(test_dsn, "SELECT id FROM bank_loans WHERE actor_id = %s", (actor_id,)) == []


def test_only_the_borrower_can_pledge_a_deed(app, client, test_dsn):
    owner = guest(client, device_id="lien-device-3")
    other = guest(client, device_id="lien-device-4")
    owner_actor = _actor(test_dsn, owner["player"]["id"])
    other_actor = _actor(test_dsn, other["player"]["id"])
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, owner_actor, appraised="5000")

    with pytest.raises(Forbidden):
        _open(app, actor_id=other_actor, bank_id=bank_id, amount="1000", assets=[deed_id])


def test_an_already_encumbered_deed_cannot_secure_a_second_loan(app, client, test_dsn):
    player = guest(client, device_id="lien-device-5")
    actor_id = _actor(test_dsn, player["player"]["id"])
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, actor_id, appraised="5000")

    _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])
    with pytest.raises(Unprocessable):
        _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])


def test_full_repayment_releases_the_lien(app, client, test_dsn):
    player = guest(client, device_id="lien-device-6")
    actor_id = _actor(test_dsn, player["player"]["id"])
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, actor_id, appraised="5000")
    loan = _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])

    with app.app_context():
        with db().transaction() as conn:
            bank_service.repay(conn, actor={"id": actor_id}, loan_id=loan["id"], amount=Decimal("1000"))

    collateral = _rows(test_dsn, "SELECT status FROM bank_loan_collateral WHERE loan_id = %s", (loan["id"],))
    assert collateral[0]["status"] == "released"
    liens = _rows(test_dsn, "SELECT released_at FROM property_encumbrances WHERE asset_id = %s", (deed_id,))
    assert liens[0]["released_at"] is not None


# ------------------------------------------------------- default → seizure


def test_default_seizes_the_deed_and_opens_an_auction(app, client, test_dsn):
    player = guest(client, device_id="lien-device-7")
    actor_id = _actor(test_dsn, player["player"]["id"])
    bank_id, bank_actor = _bank(test_dsn)
    deed_id = _deed(test_dsn, actor_id, appraised="2000")
    loan = _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])
    _age_loan(test_dsn, loan["id"], interest="50")

    result = _tick(app)
    assert result["defaulted"] == 1 and result["seized"] == 1

    listing = _rows(
        test_dsn,
        "SELECT id, kind, price, min_increment, seller_actor_id, status FROM property_listings WHERE asset_id = %s",
        (deed_id,),
    )[0]
    assert listing["kind"] == "auction" and listing["status"] == "open"
    assert Decimal(listing["price"]) == Decimal("1050")  # principal + interest
    assert Decimal(listing["min_increment"]) == Decimal("10.5")  # 1%
    assert str(listing["seller_actor_id"]) == bank_actor

    asset = _rows(test_dsn, "SELECT owner_actor_id, status FROM property_assets WHERE id = %s", (deed_id,))[0]
    assert str(asset["owner_actor_id"]) == bank_actor
    assert asset["status"] == "auction"

    collateral = _rows(
        test_dsn, "SELECT status, listing_id FROM bank_loan_collateral WHERE loan_id = %s", (loan["id"],)
    )[0]
    assert collateral["status"] == "seized"
    assert str(collateral["listing_id"]) == str(listing["id"])


def test_seizure_is_idempotent(app, client, test_dsn):
    player = guest(client, device_id="lien-device-8")
    actor_id = _actor(test_dsn, player["player"]["id"])
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, actor_id, appraised="2000")
    loan = _open(app, actor_id=actor_id, bank_id=bank_id, amount="1000", assets=[deed_id])
    _age_loan(test_dsn, loan["id"], interest="50")

    _tick(app)
    second = _tick(app)

    assert second["defaulted"] == 0 and second["seized"] == 0
    listings = _rows(test_dsn, "SELECT id FROM property_listings WHERE asset_id = %s", (deed_id,))
    assert len(listings) == 1


# --------------------------------------------------- auction → distribution


def _bid_and_close(app, *, listing_id: str, bidder_actor: str, amount: str) -> dict:
    with app.app_context():
        with db().transaction() as conn:
            property_service.bid(conn, bidder={"id": bidder_actor}, listing_id=listing_id, amount=Decimal(amount))
            return property_service.close_auction(conn, listing_id=listing_id)


def test_auction_proceeds_pay_interest_then_principal_then_borrower(app, client, test_dsn):
    borrower = guest(client, device_id="lien-device-9")
    buyer = guest(client, device_id="lien-device-10")
    borrower_actor = _actor(test_dsn, borrower["player"]["id"])
    buyer_actor = _actor(test_dsn, buyer["player"]["id"])
    _fund(test_dsn, buyer["player"]["id"], "1500")
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, borrower_actor, appraised="2000")
    loan = _open(app, actor_id=borrower_actor, bank_id=bank_id, amount="1000", assets=[deed_id])
    _age_loan(test_dsn, loan["id"], interest="50")

    _tick(app)
    listing_id = _rows(test_dsn, "SELECT id FROM property_listings WHERE asset_id = %s", (deed_id,))[0]["id"]

    settled = _bid_and_close(app, listing_id=str(listing_id), bidder_actor=buyer_actor, amount="1500")
    # 1500 - 2% tax - 1% commission = 1455 net to the bank.
    assert settled["seller_net"] == "1455.0000"
    liquidation = settled["liquidation"]
    assert liquidation["paid_interest"] == "50.0000"
    assert liquidation["paid_principal"] == "1000.0000"
    assert liquidation["surplus"] == "405.0000"
    assert liquidation["loan_status"] == "liquidated"
    assert liquidation["outstanding"] == "0.0000"

    # The borrower got the surplus and no more; the buyer paid exactly the bid.
    assert _balance(test_dsn, borrower["player"]["id"]) == Decimal("1405.0000")  # 1000 loan + 405 surplus
    assert _balance(test_dsn, buyer["player"]["id"]) == Decimal("0")

    collateral = _rows(test_dsn, "SELECT status FROM bank_loan_collateral WHERE loan_id = %s", (loan["id"],))[0]
    assert collateral["status"] == "sold"
    liens = _rows(test_dsn, "SELECT released_at FROM property_encumbrances WHERE asset_id = %s", (deed_id,))
    assert liens[0]["released_at"] is not None
    owner = _rows(test_dsn, "SELECT owner_actor_id FROM property_assets WHERE id = %s", (deed_id,))[0]
    assert str(owner["owner_actor_id"]) == buyer_actor
    sold = _rows(test_dsn, "SELECT type FROM domain_events WHERE type = 'collateral.sold'", ())
    assert sold


def test_partial_recovery_keeps_the_residual_debt_in_default(app, client, test_dsn):
    borrower = guest(client, device_id="lien-device-11")
    buyer = guest(client, device_id="lien-device-12")
    borrower_actor = _actor(test_dsn, borrower["player"]["id"])
    buyer_actor = _actor(test_dsn, buyer["player"]["id"])
    _fund(test_dsn, buyer["player"]["id"], "600")
    bank_id, _ = _bank(test_dsn)
    deed_id = _deed(test_dsn, borrower_actor, appraised="2000")
    loan = _open(app, actor_id=borrower_actor, bank_id=bank_id, amount="1000", assets=[deed_id])
    _age_loan(test_dsn, loan["id"], interest="50")

    _tick(app)
    listing_id = str(_rows(test_dsn, "SELECT id FROM property_listings WHERE asset_id = %s", (deed_id,))[0]["id"])
    # Reserve is 1050, so the bid floor rejects anything below it — that is the
    # point of the reserve. Drive the partial case through the settlement path
    # instead, the way a below-reserve private deal would land.
    with app.app_context():
        with db().transaction() as conn:
            result = loan_collections.settle_liquidation(conn, listing_id=listing_id, seller_net=Decimal("582"))

    assert result["paid_interest"] == "50.0000"
    assert result["paid_principal"] == "532.0000"
    assert result["surplus"] == "0.0000"
    assert result["loan_status"] == "defaulted"
    assert result["outstanding"] == "468.0000"
    assert _rows(test_dsn, "SELECT status FROM bank_loan_collateral WHERE loan_id = %s", (loan["id"],))[0]["status"] == "sold"


def test_non_liquidation_sales_are_untouched(app, client, test_dsn):
    """A normal fixed-price sale must not try to settle a loan."""
    seller = guest(client, device_id="lien-device-13")
    buyer = guest(client, device_id="lien-device-14")
    seller_actor = _actor(test_dsn, seller["player"]["id"])
    _fund(test_dsn, buyer["player"]["id"], "1200")
    deed_id = _deed(test_dsn, seller_actor, appraised="1000")
    with app.app_context():
        with db().transaction() as conn:
            listing = property_service.list_asset(
                conn,
                actor={"id": seller_actor},
                asset_key=_rows(test_dsn, "SELECT asset_key FROM property_assets WHERE id = %s", (deed_id,))[0]["asset_key"],
                kind="fixed",
                price=Decimal("1000"),
                days=7,
            )
    with app.app_context():
        with db().transaction() as conn:
            buyer_actor = _actor(test_dsn, buyer["player"]["id"])
            result = property_service.buy(conn, buyer={"id": buyer_actor}, listing_id=listing["id"])

    assert "liquidation" not in result
    assert _rows(test_dsn, "SELECT id FROM bank_loans WHERE actor_id = %s", (seller_actor,)) == []
