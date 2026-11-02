"""Property disputes: the 24h contest window and the freeze it applies (T-18).

The interesting part is the linkage, not the table: opening a dispute must make
the deed unbuyable and unlistable *through the existing checks*, and closing it
must give the deed back — without touching a lender's lien.
"""

from __future__ import annotations

import uuid

import psycopg
from psycopg.rows import dict_row

from server.infra.context import db
from server.jobs import tasks
from tests.helpers import bearer
from tests.integration.test_commerce_property import (
    _actor_id,
    _fund,
    _headers,
    _make_admin,
    _player,
)


def _register(client, test_dsn, *, owner_actor: str, base: str = "1000") -> str:
    admin = _player(client, f"dispute-admin-{uuid.uuid4().hex[:6]}")
    _make_admin(test_dsn, admin["id"])
    asset_key = f"dispute-{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/properties",
        json={
            "asset_key": asset_key,
            "kind": "planet",
            "name": "争议星",
            "owner_actor_id": owner_actor,
            "base_by_type": base,
            "resource_score": "1",
        },
        headers=_headers(admin["token"], str(uuid.uuid4())),
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    return asset_key


def _sell(client, test_dsn, *, seller: dict, buyer: dict, asset_key: str, price: str) -> str:
    """Seller lists at a fixed price, buyer lifts it; returns the asset id."""
    listed = client.post(
        f"/api/v1/properties/{asset_key}/list",
        json={"price": price, "kind": "fixed", "days": 7},
        headers=_headers(seller["token"], str(uuid.uuid4())),
    )
    assert listed.status_code == 200, listed.get_data(as_text=True)
    listing_id = listed.get_json()["data"]["id"]

    bought = client.post(
        f"/api/v1/properties/listings/{listing_id}/buy",
        json={},
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert bought.status_code == 200, bought.get_data(as_text=True)
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        return str(
            conn.execute("SELECT id FROM property_assets WHERE asset_key = %s", (asset_key,)).fetchone()["id"]
        )


def _asset(test_dsn, asset_key: str) -> dict:
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT id, status, owner_actor_id FROM property_assets WHERE asset_key = %s",
            (asset_key,),
        ).fetchone()


def _dispute(client, token: str, asset_key: str, reason: str = "duress"):
    return client.post(
        f"/api/v1/properties/{asset_key}/dispute",
        json={"reason": reason},
        headers=_headers(token, str(uuid.uuid4())),
    )


def test_buyer_can_contest_within_the_window_and_the_deed_freezes(client, test_dsn):
    seller = _player(client, "dispute-seller-1")
    buyer = _player(client, "dispute-buyer-1")
    _fund(test_dsn, seller["id"], "cc1", "10")
    _fund(test_dsn, buyer["id"], "cc1", "5000")
    seller_actor = _actor_id(test_dsn, seller["id"])
    asset_key = _register(client, test_dsn, owner_actor=seller_actor)
    _sell(client, test_dsn, seller=seller, buyer=buyer, asset_key=asset_key, price="1000")

    opened = _dispute(client, buyer["token"], asset_key)
    assert opened.status_code == 200, opened.get_data(as_text=True)
    dispute = opened.get_json()["data"]
    assert dispute["status"] == "open"
    assert dispute["frozen"]["status"] == "frozen"

    row = _asset(test_dsn, asset_key)
    assert row["status"] == "frozen"

    # The freeze is enforced by the checks that already existed.
    relist = client.post(
        f"/api/v1/properties/{asset_key}/list",
        json={"price": "1100", "kind": "fixed", "days": 7},
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert relist.status_code == 422, relist.get_data(as_text=True)


def test_a_stranger_cannot_open_a_dispute(client, test_dsn):
    seller = _player(client, "dispute-seller-2")
    buyer = _player(client, "dispute-buyer-2")
    stranger = _player(client, "dispute-stranger-2")
    _fund(test_dsn, seller["id"], "cc1", "10")
    _fund(test_dsn, buyer["id"], "cc1", "5000")
    seller_actor = _actor_id(test_dsn, seller["id"])
    asset_key = _register(client, test_dsn, owner_actor=seller_actor)
    _sell(client, test_dsn, seller=seller, buyer=buyer, asset_key=asset_key, price="1000")

    response = _dispute(client, stranger["token"], asset_key)
    assert response.status_code == 403, response.get_data(as_text=True)


def test_the_window_closes_after_24h(client, test_dsn):
    seller = _player(client, "dispute-seller-3")
    buyer = _player(client, "dispute-buyer-3")
    _fund(test_dsn, seller["id"], "cc1", "10")
    _fund(test_dsn, buyer["id"], "cc1", "5000")
    seller_actor = _actor_id(test_dsn, seller["id"])
    asset_key = _register(client, test_dsn, owner_actor=seller_actor)
    _sell(client, test_dsn, seller=seller, buyer=buyer, asset_key=asset_key, price="1000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE property_transfers SET created_at = now() - interval '25 hours' "
            "WHERE asset_id = (SELECT id FROM property_assets WHERE asset_key = %s)",
            (asset_key,),
        )

    response = _dispute(client, buyer["token"], asset_key)
    assert response.status_code == 422, response.get_data(as_text=True)
    assert "争议期已过" in response.get_json()["detail"]
    assert _asset(test_dsn, asset_key)["status"] == "owned"


def test_rejecting_a_dispute_releases_the_deed(client, test_dsn):
    seller = _player(client, "dispute-seller-4")
    buyer = _player(client, "dispute-buyer-4")
    _fund(test_dsn, seller["id"], "cc1", "10")
    _fund(test_dsn, buyer["id"], "cc1", "5000")
    seller_actor = _actor_id(test_dsn, seller["id"])
    asset_key = _register(client, test_dsn, owner_actor=seller_actor)
    _sell(client, test_dsn, seller=seller, buyer=buyer, asset_key=asset_key, price="1000")
    dispute = _dispute(client, buyer["token"], asset_key).get_json()["data"]

    admin = _player(client, "dispute-judge-4")
    _make_admin(test_dsn, admin["id"])
    resolved = client.post(
        f"/api/v1/properties/disputes/{dispute['id']}/resolve",
        json={"upheld": False, "note": "证据不足"},
        headers=_headers(admin["token"], str(uuid.uuid4())),
    )
    assert resolved.status_code == 200, resolved.get_data(as_text=True)
    body = resolved.get_json()["data"]
    assert body["status"] == "rejected"
    assert body["status"] != "open"
    assert _asset(test_dsn, asset_key)["status"] == "owned"

    relist = client.post(
        f"/api/v1/properties/{asset_key}/list",
        json={"price": "1100", "kind": "fixed", "days": 7},
        headers=_headers(buyer["token"], str(uuid.uuid4())),
    )
    assert relist.status_code == 200, relist.get_data(as_text=True)


def test_upholding_keeps_the_deed_frozen(client, test_dsn):
    seller = _player(client, "dispute-seller-5")
    buyer = _player(client, "dispute-buyer-5")
    _fund(test_dsn, seller["id"], "cc1", "10")
    _fund(test_dsn, buyer["id"], "cc1", "5000")
    seller_actor = _actor_id(test_dsn, seller["id"])
    asset_key = _register(client, test_dsn, owner_actor=seller_actor)
    _sell(client, test_dsn, seller=seller, buyer=buyer, asset_key=asset_key, price="1000")
    dispute = _dispute(client, buyer["token"], asset_key).get_json()["data"]

    admin = _player(client, "dispute-judge-5")
    _make_admin(test_dsn, admin["id"])
    resolved = client.post(
        f"/api/v1/properties/disputes/{dispute['id']}/resolve",
        json={"upheld": True, "note": "判令返还"},
        headers=_headers(admin["token"], str(uuid.uuid4())),
    )
    assert resolved.status_code == 200, resolved.get_data(as_text=True)
    assert _asset(test_dsn, asset_key)["status"] == "frozen"
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        kinds = [
            row["kind"]
            for row in conn.execute(
                "SELECT kind FROM property_encumbrances WHERE asset_id = %s AND released_at IS NULL",
                (_asset(test_dsn, asset_key)["id"],),
            ).fetchall()
        ]
    assert kinds == ["freeze"]


def test_expired_disputes_lift_the_freeze(app, client, test_dsn):
    seller = _player(client, "dispute-seller-6")
    buyer = _player(client, "dispute-buyer-6")
    _fund(test_dsn, seller["id"], "cc1", "10")
    _fund(test_dsn, buyer["id"], "cc1", "5000")
    seller_actor = _actor_id(test_dsn, seller["id"])
    asset_key = _register(client, test_dsn, owner_actor=seller_actor)
    _sell(client, test_dsn, seller=seller, buyer=buyer, asset_key=asset_key, price="1000")
    _dispute(client, buyer["token"], asset_key)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE property_disputes SET closes_at = now() - interval '1 hour' WHERE status = 'open'"
        )

    with app.app_context():
        with db().transaction() as conn:
            result = tasks.property_dispute_tick(conn)
    assert result["expired"] == 1
    assert _asset(test_dsn, asset_key)["status"] == "owned"
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        status = conn.execute(
            "SELECT status FROM property_disputes ORDER BY opened_at DESC LIMIT 1"
        ).fetchone()["status"]
    assert status == "expired"
