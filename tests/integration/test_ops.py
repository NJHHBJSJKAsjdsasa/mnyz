"""Operator surface: lock / unlock / compensate / announce / dashboard (12 §5).

Every mutation must leave an ``audit_log`` row — an operations action without a
trail is indistinguishable from a database edit, which is the thing this module
exists to replace.
"""

from __future__ import annotations

import uuid

import psycopg
from psycopg.rows import dict_row

from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def _audit_count(dsn: str, action: str) -> int:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT count(*) AS n FROM audit_log WHERE action = %s", (action,)
        ).fetchone()
    return int(row["n"])


def test_lock_requires_admin(client, test_dsn):
    target = guest(client, device_id="ops-target")
    attacker = guest(client, device_id="ops-attacker")
    response = client.post(
        f"/api/v1/admin/players/{target['player']['id']}/lock",
        json={"reason": "nope"},
        headers=_headers(attacker["access_token"]),
    )
    assert response.status_code == 403


def test_lock_and_unlock_round_trip(client, test_dsn):
    admin = guest(client, device_id="ops-admin")
    target = guest(client, device_id="ops-victim")
    _make_admin(test_dsn, admin["player"]["id"])
    target_id = target["player"]["id"]

    locked = client.post(
        f"/api/v1/admin/players/{target_id}/lock",
        json={"reason": "多账号刷资源"},
        headers=_headers(admin["access_token"]),
    )
    assert locked.status_code == 200, locked.get_data(as_text=True)
    assert locked.get_json()["data"]["locked"] is True

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        reason = conn.execute("SELECT locked_reason FROM players WHERE id = %s", (target_id,)).fetchone()
    assert reason["locked_reason"] == "多账号刷资源"

    # A locked player cannot act (PlayerLocked → 423 on write endpoints).
    blocked = client.post(
        f"/api/v1/travel/quote",
        json={
            "kind": "planet",
            "origin": {"x": 1000000, "y": 1000000, "z": 1000000},
            "target": {"x": 1000000, "y": 1000000, "z": 1000001},
        },
        headers=_headers(target["access_token"]),
    )
    assert blocked.status_code == 423

    unlocked = client.post(
        f"/api/v1/admin/players/{target_id}/unlock", headers=_headers(admin["access_token"])
    )
    assert unlocked.status_code == 200
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        reason = conn.execute("SELECT locked_reason FROM players WHERE id = %s", (target_id,)).fetchone()
    assert reason["locked_reason"] is None

    assert _audit_count(test_dsn, "player.lock") == 1
    assert _audit_count(test_dsn, "player.unlock") == 1


def test_grant_is_additive_and_audited(client, test_dsn):
    admin = guest(client, device_id="ops-admin-2")
    target = guest(client, device_id="ops-grantee")
    _make_admin(test_dsn, admin["player"]["id"])
    target_id = target["player"]["id"]

    granted = client.post(
        f"/api/v1/admin/players/{target_id}/grant",
        json={"resource_code": "antimatter", "amount": "2500", "reason": "客服补偿：采集丢失"},
        headers=_headers(admin["access_token"]),
    )
    assert granted.status_code == 200, granted.get_data(as_text=True)
    body = granted.get_json()["data"]
    assert body["balance"] == "2500.0000"

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        balance = conn.execute(
            "SELECT balance FROM wallets WHERE player_id = %s AND resource_code = 'antimatter'",
            (target_id,),
        ).fetchone()
    assert balance["balance"] == 2500
    assert _audit_count(test_dsn, "player.grant") == 1


def test_grant_rejects_absurd_amounts(client, test_dsn):
    admin = guest(client, device_id="ops-admin-3")
    target = guest(client, device_id="ops-greedy")
    _make_admin(test_dsn, admin["player"]["id"])

    response = client.post(
        f"/api/v1/admin/players/{target['player']['id']}/grant",
        json={"resource_code": "antimatter", "amount": "999999999", "reason": "oops"},
        headers=_headers(admin["access_token"]),
    )
    assert response.status_code == 400


def test_announcement_lifecycle(client, test_dsn):
    admin = guest(client, device_id="ops-admin-4")
    _make_admin(test_dsn, admin["player"]["id"])

    created = client.post(
        "/api/v1/admin/announcements",
        json={"title": "维护公告", "body": "今晚 23:00 停机 10 分钟", "severity": "caution", "hours": 2},
        headers=_headers(admin["access_token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    announcement = created.get_json()["data"]
    assert announcement["severity"] == "caution"
    assert announcement["ends_at"] is not None

    listed = client.get("/api/v1/admin/announcements", headers=_headers(admin["access_token"]))
    assert [item["id"] for item in listed.get_json()["data"]["announcements"]] == [announcement["id"]]

    removed = client.delete(
        f"/api/v1/admin/announcements/{announcement['id']}", headers=_headers(admin["access_token"])
    )
    assert removed.status_code == 200 and removed.get_json()["data"]["active"] is False

    listed_again = client.get("/api/v1/admin/announcements", headers=_headers(admin["access_token"]))
    assert listed_again.get_json()["data"]["announcements"] == []
    assert _audit_count(test_dsn, "announcement.publish") == 1
    assert _audit_count(test_dsn, "announcement.deactivate") == 1


def test_dashboard_shape(client, test_dsn):
    admin = guest(client, device_id="ops-admin-5")
    _make_admin(test_dsn, admin["player"]["id"])

    response = client.get("/api/v1/admin/economy/dashboard", headers=_headers(admin["access_token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    assert data["players"]["total"] >= 1
    assert set(data["risk"]) >= {
        "bankrupt_companies",
        "open_insolvency",
        "open_court_cases",
        "pending_licences",
        "unbalanced_transactions_24h",
    }
    assert isinstance(data["currency"], list)
    assert isinstance(data["resources"], list)
