"""Companies and property: registration, shares, financials, sale, holding tax."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _headers(token: str, key: str | None = None) -> dict[str, str]:
    headers = bearer(token)
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _player(client, device: str) -> dict:
    data = guest(client, device_id=device)
    return {"token": data["access_token"], "id": data["player"]["id"]}


def _fund(dsn: str, player_id: str, code: str, amount: str) -> None:
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


def _actor_id(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    return str(actor["id"])


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def test_company_register_transfer_and_financials(client, test_dsn):
    founder = _player(client, "company-device-1")
    partner = _player(client, "company-device-2")
    _fund(test_dsn, founder["id"], "cc3", "5")

    created = client.post(
        "/api/v1/companies",
        json={"ticker": "ACME", "name": "阿克米工业", "shares_total": 1000000},
        headers=_headers(founder["token"], str(uuid.uuid4())),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    company = created.get_json()["data"]
    assert company["ticker"] == "ACME"
    assert company["founder_shares"] == 1000000

    detail = client.get("/api/v1/companies/ACME", headers=bearer(founder["token"])).get_json()["data"]
    assert detail["holdings"][0]["shares"] == 1000000

    partner_actor = _actor_id(test_dsn, partner["id"])
    moved = client.post(
        "/api/v1/companies/ACME/shares/transfer",
        json={"to_actor_id": partner_actor, "shares": 400000},
        headers=_headers(founder["token"], str(uuid.uuid4())),
    )
    assert moved.status_code == 200, moved.get_data(as_text=True)
    assert moved.get_json()["data"]["to_balance"] == 400000

    published = client.post(
        "/api/v1/companies/ACME/financials",
        json={
            "period": date.today().isoformat(),
            "revenue": "1000",
            "cost": "400",
            "assets": "5000",
            "liabilities": "1000",
        },
        headers=_headers(founder["token"], str(uuid.uuid4())),
    )
    assert published.status_code == 200, published.get_data(as_text=True)
    assert published.get_json()["data"]["profit"] == "600.0000"
    assert published.get_json()["data"]["book_value"] == "4000.0000"

    # 40% 股东没有披露权限
    denied = client.post(
        "/api/v1/companies/ACME/financials",
        json={
            "period": date.today().isoformat(),
            "revenue": "1",
            "cost": "1",
            "assets": "1",
            "liabilities": "0",
        },
        headers=_headers(partner["token"], str(uuid.uuid4())),
    )
    assert denied.status_code == 403


def test_property_listing_sale_and_holding_tax(client, test_dsn):
    from server.domain import property_service

    admin = _player(client, "prop-device-admin")
    _make_admin(test_dsn, admin["id"])
    seller = _player(client, "prop-device-seller")
    buyer = _player(client, "prop-device-buyer")
    seller_actor = _actor_id(test_dsn, seller["id"])
    _fund(test_dsn, buyer["id"], "cc1", "20000")

    created = client.post(
        "/api/v1/properties",
        json={
            "asset_key": "planet_1,2,3_0_测试星",
            "kind": "planet",
            "name": "测试星",
            "jurisdiction_sector": "core",
            "owner_actor_id": seller_actor,
            "base_by_type": "10000",
            "resource_score": "1",
            "development_level": 0,
            "traffic_index": "0",
        },
        headers=_headers(admin["token"], str(uuid.uuid4())),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    asset = created.get_json()["data"]
    assert Decimal(asset["appraised_value"]) == Decimal("14000.0000")

    listed = client.post(
        f"/api/v1/properties/{asset['asset_key']}/list",
        json={"price": "14000", "kind": "fixed", "days": 30},
        headers=_headers(seller["token"], str(uuid.uuid4())),
    )
    assert listed.status_code == 200, listed.get_data(as_text=True)
    listing_id = listed.get_json()["data"]["id"]

    bought = client.post(
        f"/api/v1/properties/listings/{listing_id}/buy",
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert bought.status_code == 200, bought.get_data(as_text=True)
    deal = bought.get_json()["data"]
    assert deal["price"] == "14000.0000"
    assert deal["transfer_tax"] == "280.0000"  # 2%
    assert deal["commission"] == "140.0000"  # 1%
    assert deal["seller_net"] == "13580.0000"

    mine = client.get("/api/v1/properties/my", headers=bearer(buyer["token"])).get_json()["data"]
    assert [row["asset_key"] for row in mine["properties"]] == [asset["asset_key"]]

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        issued = property_service.issue_tax_bills(conn)
    assert issued["bills"] == 1
    assert Decimal(issued["total"]) == Decimal("28.0000")  # 20bp of 14000

    bills = client.get("/api/v1/properties/tax", headers=bearer(buyer["token"])).get_json()["data"]["bills"]
    assert len(bills) == 1
    paid = client.post(
        f"/api/v1/properties/tax/{bills[0]['id']}/pay",
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert paid.status_code == 200, paid.get_data(as_text=True)
    assert paid.get_json()["data"]["status"] == "paid"


def test_auction_bid_rejects_below_floor(client, test_dsn):
    from server.domain import property_service

    admin = _player(client, "auc-admin")
    _make_admin(test_dsn, admin["id"])
    seller = _player(client, "auc-seller")
    bidder = _player(client, "auc-bidder")
    seller_actor = _actor_id(test_dsn, seller["id"])

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        asset = property_service.register_asset(
            conn,
            asset_key="system_9,9,9",
            kind="system",
            name="拍卖星系",
            jurisdiction_sector="core",
            owner_actor_id=seller_actor,
            base_by_type=Decimal("20000"),
        )
        listing = property_service.list_asset(
            conn, actor={"id": seller_actor}, asset_key=asset["asset_key"],
            price=Decimal("20000"), kind="auction", min_increment=Decimal("100"),
        )

    low = client.post(
        f"/api/v1/properties/listings/{listing['id']}/bid",
        json={"amount": "19999"},
        headers=_headers(bidder["token"], str(uuid.uuid4())),
    )
    assert low.status_code == 400

    ok = client.post(
        f"/api/v1/properties/listings/{listing['id']}/bid",
        json={"amount": "20100"},
        headers=_headers(bidder["token"], str(uuid.uuid4())),
    )
    assert ok.status_code == 200, ok.get_data(as_text=True)
    assert ok.get_json()["data"]["status"] == "leading"
