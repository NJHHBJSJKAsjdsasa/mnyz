"""Commercial licences: apply → review → active (03 §3).

Free to apply, money moves only on approval. The capital floor is checked at
approval (a balance requirement, not an escrow), and the first month's fee goes
to treasury in the licence's own currency.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _actor(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_service.actor_for_player(conn, {"id": player_id})
    return str(actor["id"])


def _fund(dsn: str, actor_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[Move(treasury["id"], code, -Decimal(amount)), Move(actor_id, code, Decimal(amount))],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _balance(dsn: str, actor_id: str, code: str) -> Decimal:
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


def _apply(client, token: str, kind: str = "cross_region_trade"):
    return client.post("/api/v1/commerce/licenses", json={"kind": kind}, headers=_headers(token))


def _decide(client, token: str, license_id: str, approve: bool = True):
    return client.post(
        f"/api/v1/admin/commerce/licenses/{license_id}/decide",
        json={"approve": approve, "note": "test"},
        headers=_headers(token),
    )


def test_catalogue_lists_all_six_kinds(client):
    data = guest(client)
    body = client.get("/api/v1/commerce/licences/catalogue", headers=_headers(data["access_token"]))
    assert body.status_code == 200
    kinds = {item["kind"] for item in body.get_json()["data"]["licences"]}
    assert kinds == {
        "cross_region_trade",
        "property_broker",
        "port",
        "securities_firm",
        "bank",
        "exchange",
    }


def test_apply_is_free_and_idempotent(client):
    data = guest(client)
    token = data["access_token"]

    first = _apply(client, token)
    assert first.status_code == 200, first.get_data(as_text=True)
    payload = first.get_json()["data"]
    assert payload["status"] == "pending" and payload["reused"] is False

    second = _apply(client, token).get_json()["data"]
    assert second["id"] == payload["id"] and second["reused"] is True


def test_only_admin_can_decide(client):
    applicant = guest(client, device_id="lic-applicant")
    other = guest(client, device_id="lic-other")
    license_id = _apply(client, applicant["access_token"]).get_json()["data"]["id"]

    forbidden = _decide(client, other["access_token"], license_id)
    assert forbidden.status_code == 403


def test_approval_charges_the_first_month(client, test_dsn):
    applicant = guest(client, device_id="lic-payer")
    reviewer = guest(client, device_id="lic-admin")
    _make_admin(test_dsn, reviewer["player"]["id"])
    actor_id = _actor(test_dsn, applicant["player"]["id"])
    _fund(test_dsn, actor_id, "cc3", "1000")

    license_id = _apply(client, applicant["access_token"]).get_json()["data"]["id"]
    before = _balance(test_dsn, actor_id, "cc3")

    approved = _decide(client, reviewer["access_token"], license_id, approve=True)
    assert approved.status_code == 200, approved.get_data(as_text=True)
    body = approved.get_json()["data"]
    assert body["status"] == "active"
    assert body["charged"] == "200.0000"
    assert body["expires_at"] is not None
    assert _balance(test_dsn, actor_id, "cc3") == before - Decimal("200")


def test_approval_fails_without_the_capital_floor(client, test_dsn):
    applicant = guest(client, device_id="lic-poor")
    reviewer = guest(client, device_id="lic-admin-2")
    _make_admin(test_dsn, reviewer["player"]["id"])
    actor_id = _actor(test_dsn, applicant["player"]["id"])
    _fund(test_dsn, actor_id, "cc5", "100")  # bank needs 50,000

    license_id = _apply(client, applicant["access_token"], kind="bank").get_json()["data"]["id"]
    decision = _decide(client, reviewer["access_token"], license_id, approve=True)
    assert decision.status_code == 422
    assert "50000" in decision.get_json()["detail"]


def test_rejection_revokes_without_charging(client, test_dsn):
    applicant = guest(client, device_id="lic-reject")
    reviewer = guest(client, device_id="lic-admin-3")
    _make_admin(test_dsn, reviewer["player"]["id"])
    actor_id = _actor(test_dsn, applicant["player"]["id"])
    _fund(test_dsn, actor_id, "cc3", "1000")

    license_id = _apply(client, applicant["access_token"]).get_json()["data"]["id"]
    rejected = _decide(client, reviewer["access_token"], license_id, approve=False).get_json()["data"]
    assert rejected["status"] == "revoked"
    assert _balance(test_dsn, actor_id, "cc3") == Decimal("1000")


def test_pending_queue_is_admin_only(client, test_dsn):
    applicant = guest(client, device_id="lic-queue")
    reviewer = guest(client, device_id="lic-admin-4")
    _make_admin(test_dsn, reviewer["player"]["id"])
    license_id = _apply(client, applicant["access_token"]).get_json()["data"]["id"]

    assert client.get("/api/v1/admin/commerce/licenses/pending", headers=_headers(applicant["access_token"])).status_code == 403
    listing = client.get("/api/v1/admin/commerce/licenses/pending", headers=_headers(reviewer["access_token"]))
    ids = [row["id"] for row in listing.get_json()["data"]["licenses"]]
    assert license_id in ids
