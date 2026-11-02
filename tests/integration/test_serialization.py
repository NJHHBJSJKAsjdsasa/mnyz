"""Response serialisation contract (10 §P1-4 / 12 §G).

The rule is one sentence: **timestamps leave the API as UTC ISO-8601 with a ``Z``,
money leaves as a decimal string.** These tests pin the helper and two live
endpoints, so a future refactor cannot quietly reintroduce ``.isoformat()`` (which
emits ``+00:00`` for aware values and *no offset at all* for naive ones).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.infra.serialize import day, money, ts
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


# ------------------------------------------------------------------ helpers


def test_ts_normalises_both_kinds_of_datetime():
    aware = datetime(2026, 10, 28, 9, 30, 15, 250000, tzinfo=timezone.utc)
    assert ts(aware) == "2026-10-28T09:30:15.250Z"

    naive = datetime(2026, 10, 28, 9, 30, 15, 250000)
    assert ts(naive) == "2026-10-28T09:30:15.250Z", "naive values are read as UTC"

    offset = datetime(2026, 10, 28, 17, 30, 15, 250000, tzinfo=timezone.utc)
    assert ts(offset).endswith("Z")


def test_ts_and_day_keep_none_as_none():
    assert ts(None) is None
    assert day(None) is None
    assert day(date(2026, 10, 28)) == "2026-10-28"


def test_money_preserves_the_stored_scale():
    assert money(Decimal("1234.5600")) == "1234.5600"
    assert money(Decimal("0.0001")) == "0.0001"
    assert money(12) == "12"
    assert money(None) is None


# ------------------------------------------------------------------ endpoints


def test_job_runs_timestamps_end_with_z(client, test_dsn):
    admin = guest(client, device_id="ser-admin")
    _make_admin(test_dsn, admin["player"]["id"])

    response = client.get("/api/v1/admin/jobs/runs", headers=_headers(admin["access_token"]))
    assert response.status_code == 200
    for run in response.get_json()["data"]["runs"]:
        assert run["started_at"].endswith("Z"), run
        if run["finished_at"]:
            assert run["finished_at"].endswith("Z"), run
        assert run["run_date"].count("-") == 2, "run_date is a calendar day, not a timestamp"


def test_announcement_window_is_zulu(client, test_dsn):
    admin = guest(client, device_id="ser-admin-2")
    _make_admin(test_dsn, admin["player"]["id"])

    created = client.post(
        "/api/v1/admin/announcements",
        json={"title": "序列化检查", "body": "", "severity": "info", "hours": 1},
        headers=_headers(admin["access_token"]),
    )
    body = created.get_json()["data"]
    assert body["starts_at"].endswith("Z")
    assert body["ends_at"].endswith("Z")
    assert body["created_at"].endswith("Z")


def test_travel_history_is_zulu(client):
    data = guest(client)
    response = client.get("/api/v1/travel/history", headers=_headers(data["access_token"]))
    assert response.status_code == 200
    assert isinstance(response.get_json()["data"]["travels"], list)
