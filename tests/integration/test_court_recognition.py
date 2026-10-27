"""Cross-region judgment recognition: request, refuse, appeal once, gate enforcement."""

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


def _actor_id(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    return str(actor["id"])


def _fund(dsn: str, player_id: str, code: str, amount: str) -> None:
    actor_id = _actor_id(dsn, player_id)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[Move(treasury["id"], code, -Decimal(amount)),
                   Move(actor_id, code, Decimal(amount))],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _balance(dsn: str, actor_id: str, code: str = "cc1") -> Decimal:
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


def _judged_case(client, dsn: str, *, tag: str, amount: str = "100") -> dict:
    plaintiff = _player(client, f"{tag}-plaintiff")
    defendant = _player(client, f"{tag}-defendant")
    _fund(dsn, plaintiff["id"], "cc1", "100")
    _fund(dsn, defendant["id"], "cc1", "500")
    case = client.post(
        "/api/v1/court/cases",
        json={"kind": "contract", "defendant_actor_id": _actor_id(dsn, defendant["id"]),
              "amount": amount},
        headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    for index in range(3):
        client.post(
            f"/api/v1/court/cases/{case['id']}/evidence",
            json={"summary": f"证据 {index}"}, headers=_headers(plaintiff["token"]),
        )
    _make_admin(dsn, plaintiff["id"])
    judged = client.post(
        f"/api/v1/admin/court/cases/{case['id']}/judge", json={},
        headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    return {
        "case": case,
        "judgment_id": judged["judgment_id"],
        "plaintiff": plaintiff,
        "defendant": defendant,
    }


def test_request_refuse_and_recognize(client, test_dsn):
    setup = _judged_case(client, test_dsn, tag="rec-a")
    plaintiff = setup["plaintiff"]
    judgment_id = setup["judgment_id"]
    case_id = setup["case"]["id"]

    requested = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    )
    assert requested.status_code == 200, requested.get_data(as_text=True)
    record = requested.get_json()["data"]
    assert record["status"] == "requested"
    recognition_id = record["id"]

    duplicate = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    )
    assert duplicate.get_json()["data"]["duplicate"] is True

    refused = client.post(
        f"/api/v1/admin/court/recognition/{recognition_id}/decide",
        json={"recognize": False, "reason_code": "not_a_real_code", "reason": "说不清"},
        headers=_headers(plaintiff["token"]),
    )
    assert refused.status_code == 400

    refused = client.post(
        f"/api/v1/admin/court/recognition/{recognition_id}/decide",
        json={"recognize": False, "reason_code": "public_policy",
              "reason": "承认会与本区公共秩序冲突"},
        headers=_headers(plaintiff["token"]),
    )
    assert refused.status_code == 200, refused.get_data(as_text=True)
    body = refused.get_json()["data"]
    assert body["status"] == "rejected"
    assert body["reason_label"] == "违反本区公共秩序"

    appealed = client.post(
        f"/api/v1/court/recognition/{recognition_id}/appeal", json={},
        headers=_headers(setup["defendant"]["token"]),
    )
    assert appealed.status_code == 200, appealed.get_data(as_text=True)
    outcome = appealed.get_json()["data"]
    assert outcome["status"] in ("recognized", "final")
    again = client.post(
        f"/api/v1/court/recognition/{recognition_id}/appeal", json={},
        headers=_headers(plaintiff["token"]),
    )
    assert again.status_code == 422

    # a second region goes through the clean path and unblocks enforcement
    second = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "outer"}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    recognized = client.post(
        f"/api/v1/admin/court/recognition/{second['id']}/decide",
        json={"recognize": True, "reason": "程序正当"},
        headers=_headers(plaintiff["token"]),
    )
    assert recognized.status_code == 200, recognized.get_data(as_text=True)

    detail = client.get(
        f"/api/v1/court/cases/{case_id}", headers=bearer(plaintiff["token"])
    ).get_json()["data"]
    assert {item["region"] for item in detail["recognitions"]} == {"rim", "outer"}


def test_enforcement_is_gated_on_recognition(client, test_dsn):
    setup = _judged_case(client, test_dsn, tag="rec-b", amount="120")
    plaintiff = setup["plaintiff"]
    case_id = setup["case"]["id"]
    judgment_id = setup["judgment_id"]

    blocked = client.post(
        f"/api/v1/court/cases/{case_id}/enforce",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    )
    assert blocked.status_code == 422
    assert "尚未在 rim 区获得承认" in blocked.get_json()["detail"]

    request = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    client.post(
        f"/api/v1/admin/court/recognition/{request['id']}/decide",
        json={"recognize": True}, headers=_headers(plaintiff["token"]),
    )
    enforced = client.post(
        f"/api/v1/court/cases/{case_id}/enforce",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    )
    assert enforced.status_code == 200, enforced.get_data(as_text=True)
    assert enforced.get_json()["data"]["paid"] == "120.0000"
    defendant_actor = _actor_id(test_dsn, setup["defendant"]["id"])
    assert _balance(test_dsn, defendant_actor) == Decimal("380.0000")


def test_home_region_and_permissions(client, test_dsn):
    setup = _judged_case(client, test_dsn, tag="rec-c")
    plaintiff = setup["plaintiff"]
    judgment_id = setup["judgment_id"]

    home = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "core"}, headers=_headers(plaintiff["token"]),
    )
    assert home.status_code == 400

    outsider = _player(client, "rec-outsider")
    request = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]

    foreign = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "rim"}, headers=_headers(outsider["token"]),
    )
    assert foreign.status_code == 403

    not_admin = client.post(
        f"/api/v1/admin/court/recognition/{request['id']}/decide",
        json={"recognize": True}, headers=_headers(outsider["token"]),
    )
    assert not_admin.status_code == 403
