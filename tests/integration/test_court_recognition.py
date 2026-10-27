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


def _judged_case(client, dsn: str, *, tag: str, amount: str = "100",
                 plaintiff_evidence: int = 3, defendant_evidence: int = 0,
                 pair: dict | None = None) -> dict:
    plaintiff = pair["plaintiff"] if pair else _player(client, f"{tag}-plaintiff")
    defendant = pair["defendant"] if pair else _player(client, f"{tag}-defendant")
    if not pair:
        _fund(dsn, plaintiff["id"], "cc1", "200")
        _fund(dsn, defendant["id"], "cc1", "500")
    case = client.post(
        "/api/v1/court/cases",
        json={"kind": "contract", "defendant_actor_id": _actor_id(dsn, defendant["id"]),
              "amount": amount},
        headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    for index in range(plaintiff_evidence):
        client.post(
            f"/api/v1/court/cases/{case['id']}/evidence",
            json={"summary": f"证据 {index}"}, headers=_headers(plaintiff["token"]),
        )
    for index in range(defendant_evidence):
        client.post(
            f"/api/v1/court/cases/{case['id']}/evidence",
            json={"summary": f"反证 {index}"}, headers=_headers(defendant["token"]),
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


def test_foreign_enforcement_runs_through_2pc(client, test_dsn):
    setup = _judged_case(client, test_dsn, tag="rec-2pc", amount="80")
    plaintiff = setup["plaintiff"]
    judgment_id = setup["judgment_id"]
    case_id = setup["case"]["id"]

    record = client.post(
        f"/api/v1/court/judgments/{judgment_id}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    client.post(
        f"/api/v1/admin/court/recognition/{record['id']}/decide",
        json={"recognize": True}, headers=_headers(plaintiff["token"]),
    )
    enforced = client.post(
        f"/api/v1/court/cases/{case_id}/enforce",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    )
    assert enforced.status_code == 200, enforced.get_data(as_text=True)
    body = enforced.get_json()["data"]
    assert body["dt_tx_id"], body
    assert body["paid"] == "80.0000"

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        tx = conn.execute(
            "SELECT kind, status, origin_region, fee_bps FROM distributed_transactions "
            "WHERE id = %s",
            (body["dt_tx_id"],),
        ).fetchone()
        participant = conn.execute(
            "SELECT participant_id, region, status FROM dt_participants WHERE tx_id = %s",
            (body["dt_tx_id"],),
        ).fetchone()
        recognition = conn.execute(
            "SELECT dt_tx_id FROM court_recognition WHERE id = %s", (record["id"],)
        ).fetchone()
    assert tx["kind"] == "court_enforcement"
    assert tx["status"] == "committed"
    assert tx["origin_region"] == "core"
    assert tx["fee_bps"] >= 5  # court_freeze risk premium on top of the region base
    assert participant["participant_id"] == "assets:rim"
    assert participant["status"] == "committed"
    assert str(recognition["dt_tx_id"]) == body["dt_tx_id"]


def test_conflicting_judgment_is_auto_rejected(client, test_dsn):
    pair = {
        "plaintiff": _player(client, "rec-conf-plaintiff"),
        "defendant": _player(client, "rec-conf-defendant"),
    }
    _fund(test_dsn, pair["plaintiff"]["id"], "cc1", "200")
    _fund(test_dsn, pair["defendant"]["id"], "cc1", "500")

    first = _judged_case(client, test_dsn, tag="conf-a", amount="90", pair=pair)
    second = _judged_case(client, test_dsn, tag="conf-b", amount="90",
                          plaintiff_evidence=0, defendant_evidence=3, pair=pair)
    assert first["judgment_id"] != second["judgment_id"]

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        verdicts = conn.execute(
            "SELECT id, judgment->>'verdict' AS verdict FROM court_judgments "
            "WHERE id = ANY(%s)",
            ([first["judgment_id"], second["judgment_id"]],),
        ).fetchall()
    by_id = {str(row["id"]): row["verdict"] for row in verdicts}
    assert by_id[first["judgment_id"]] == "plaintiff"
    assert by_id[second["judgment_id"]] == "defendant"

    plaintiff = pair["plaintiff"]
    approved = client.post(
        f"/api/v1/court/judgments/{first['judgment_id']}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    client.post(
        f"/api/v1/admin/court/recognition/{approved['id']}/decide",
        json={"recognize": True}, headers=_headers(plaintiff["token"]),
    )

    pending = client.post(
        f"/api/v1/court/judgments/{second['judgment_id']}/recognition",
        json={"region": "rim"}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    decided = client.post(
        f"/api/v1/admin/court/recognition/{pending['id']}/decide",
        json={"recognize": True}, headers=_headers(plaintiff["token"]),
    )
    assert decided.status_code == 200, decided.get_data(as_text=True)
    body = decided.get_json()["data"]
    assert body["status"] == "rejected"
    assert body["reason_code"] == "conflicting_judgment"
    assert body["conflict_with"] == approved["id"]
