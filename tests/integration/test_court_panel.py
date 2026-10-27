"""Player appellate panel: draw, strike, majority verdict and dissent."""

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
            actor = currency_service.actor_for_player(conn, {"id": player_id})
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
            ref_type="test", ref_id=str(uuid.uuid4()),
        )


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def _judged_case(client, dsn: str, tag: str) -> dict:
    plaintiff = _player(client, f"{tag}-plaintiff")
    defendant = _player(client, f"{tag}-defendant")
    _fund(dsn, plaintiff["id"], "cc1", "200")
    _fund(dsn, defendant["id"], "cc1", "500")
    case = client.post(
        "/api/v1/court/cases",
        json={"kind": "contract", "defendant_actor_id": _actor_id(dsn, defendant["id"]),
              "amount": "100"},
        headers=_headers(plaintiff["token"]),
    ).get_json()["data"]
    for index in range(3):
        client.post(
            f"/api/v1/court/cases/{case['id']}/evidence",
            json={"summary": f"证据 {index}"}, headers=_headers(plaintiff["token"]),
        )
    _make_admin(dsn, plaintiff["id"])
    client.post(f"/api/v1/admin/court/cases/{case['id']}/judge", json={},
                headers=_headers(plaintiff["token"]))
    return {"case": case, "plaintiff": plaintiff, "defendant": defendant}


def _pool_players(client, dsn: str, tag: str, count: int = 6) -> list[dict]:
    players = []
    for index in range(count):
        player = _player(client, f"{tag}-juror-{index}")
        _fund(dsn, player["id"], "cc1", "10")   # ensures an economic actor exists
        players.append(player)
    return players


def test_panel_draws_and_decides_by_majority(client, test_dsn):
    setup = _judged_case(client, test_dsn, "panel-a")
    jurors = _pool_players(client, test_dsn, "panel-a")
    plaintiff = setup["plaintiff"]

    drawn = client.post(
        f"/api/v1/court/cases/{setup['case']['id']}/appeal",
        json={"panel": True}, headers=_headers(plaintiff["token"]),
    )
    assert drawn.status_code == 200, drawn.get_data(as_text=True)
    panel = drawn.get_json()["data"]["panel"]
    assert len(panel["members"]) == 5
    serving = [row for row in panel["members"] if row["status"] == "serving"]
    assert len(serving) == 3
    assert panel["status"] == "serving"

    by_actor = {str(row["actor_id"]): row for row in panel["members"]}
    voters = []
    for juror in jurors:
        actor_id = _actor_id(test_dsn, juror["id"])
        if actor_id in by_actor and by_actor[actor_id]["status"] == "serving":
            voters.append((juror, actor_id))
    assert len(voters) >= 3

    choices = ["overturned", "overturned", "upheld"]
    last = None
    for (juror, _actor), choice in zip(voters[:3], choices):
        last = client.post(
            f"/api/v1/court/panels/{panel['id']}/vote",
            json={"choice": choice, "reason": "证据不足" if choice == "upheld" else "原判有误"},
            headers=_headers(juror["token"]),
        )
        assert last.status_code == 200, last.get_data(as_text=True)
    body = last.get_json()["data"]
    assert body["status"] == "decided"
    assert body["verdict"] == "overturned"
    assert len(body["dissent"]) == 1

    detail = client.get(f"/api/v1/court/cases/{setup['case']['id']}",
                        headers=bearer(plaintiff["token"])).get_json()["data"]
    assert detail["judgment"]["status"] == "final"
    assert Decimal(detail["judgment"]["remedy"]["pay"]) == 0


def test_strike_swaps_in_an_alternate_once_per_side(client, test_dsn):
    setup = _judged_case(client, test_dsn, "panel-b")
    _pool_players(client, test_dsn, "panel-b")
    plaintiff = setup["plaintiff"]

    panel = client.post(
        f"/api/v1/court/cases/{setup['case']['id']}/appeal",
        json={"panel": True}, headers=_headers(plaintiff["token"]),
    ).get_json()["data"]["panel"]
    serving = [row for row in panel["members"] if row["status"] == "serving"]
    target = serving[0]["actor_id"]

    struck = client.post(
        f"/api/v1/court/panels/{panel['id']}/strike",
        json={"member_actor_id": target},
        headers=_headers(plaintiff["token"]),
    )
    assert struck.status_code == 200, struck.get_data(as_text=True)
    body = struck.get_json()["data"]
    assert len([row for row in body["members"] if row["status"] == "serving"]) == 3
    assert any(row["status"] == "struck" for row in body["members"])

    again = client.post(
        f"/api/v1/court/panels/{panel['id']}/strike",
        json={"member_actor_id": [row for row in body["members"] if row["status"] == "serving"][0]["actor_id"]},
        headers=_headers(plaintiff["token"]),
    )
    assert again.status_code == 422
    assert "1 次" in again.get_json()["detail"]


def test_outsider_cannot_vote(client, test_dsn):
    setup = _judged_case(client, test_dsn, "panel-c")
    _pool_players(client, test_dsn, "panel-c")
    outsider = _player(client, "panel-c-outsider")
    panel = client.post(
        f"/api/v1/court/cases/{setup['case']['id']}/appeal",
        json={"panel": True}, headers=_headers(setup["plaintiff"]["token"]),
    ).get_json()["data"]["panel"]

    denied = client.post(
        f"/api/v1/court/panels/{panel['id']}/vote",
        json={"choice": "upheld"}, headers=_headers(outsider["token"]),
    )
    assert denied.status_code == 403
