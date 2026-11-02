"""Contract-level checks for the endpoints added in the 2026-10-28 backend pass.

Kept in one file on purpose: these assert *surface shape* (fields present, status
codes, headers), not gameplay rules, and they are the ones that would silently rot
when a payload is refactored.
"""

from __future__ import annotations

import uuid

import psycopg
from psycopg.rows import dict_row

from tests.helpers import bearer
from tests.integration.test_broker_venue import _headers, _listed, _player


def test_error_codes_are_public_and_complete(client):
    response = client.get("/api/v1/meta/error-codes")
    assert response.status_code == 200
    body = response.get_json()["data"]
    codes = {row["code"] for row in body["codes"]}
    # the ones the economy panels must translate
    assert {"insufficient_funds", "stale_state", "rate_limited", "forbidden"} <= codes
    assert body["count"] >= 20
    assert all(row["title"] for row in body["codes"])


def test_security_headers_present(client):
    response = client.get("/api/v1/meta/error-codes")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] in {"SAMEORIGIN", "DENY"}
    assert response.headers["Referrer-Policy"] == "same-origin"


def test_stock_list_is_keyset_paginated(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="PAGE1", device="page-founder")
    page = client.get("/api/v1/stocks?limit=1", headers=bearer(setup["founder"]["token"]))
    assert page.status_code == 200, page.get_data(as_text=True)
    data = page.get_json()["data"]
    assert {"stocks", "total", "has_more", "next_cursor"} <= set(data)
    assert data["total"] >= 1
    assert len(data["stocks"]) <= 1
    if data["has_more"]:
        assert data["next_cursor"]
        second = client.get(
            f"/api/v1/stocks?limit=1&cursor={data['next_cursor']}",
            headers=bearer(setup["founder"]["token"]),
        )
        assert second.status_code == 200, second.get_data(as_text=True)
        first_ticker = data["stocks"][0]["ticker"]
        assert all(row["ticker"] != first_ticker for row in second.get_json()["data"]["stocks"])

    bad = client.get("/api/v1/stocks?cursor=not-a-cursor", headers=bearer(setup["founder"]["token"]))
    assert bad.status_code == 400


def test_exchanges_expose_capacity(client, test_dsn):
    player = _player(client, "capacity-viewer")
    response = client.get("/api/v1/exchanges", headers=bearer(player["token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    rows = response.get_json()["data"]["exchanges"]
    assert rows
    for row in rows:
        assert "max_listings" in row
        assert "listing_count" in row
        assert isinstance(row["listing_count"], int)


def test_state_carries_first_paint_summaries(client):
    player = _player(client, "state-summary")
    response = client.get("/api/v1/state", headers=bearer(player["token"]))
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    assert {"wallet_summary", "portfolio_summary", "obligations"} <= set(data)
    assert "total_q1" in data["wallet_summary"]
    assert "positions" in data["portfolio_summary"]
    assert isinstance(data["obligations"], list)


def test_split_publishes_domain_event(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="EVT1", device="event-founder")
    split = client.post(
        "/api/v1/stocks/EVT1/split",
        json={"ratio": "2"},
        headers=_headers(setup["founder"]["token"]),
    )
    assert split.status_code == 200, split.get_data(as_text=True)

    stream = client.get(
        "/api/v1/events?since=0&types=stock.split",
        headers=bearer(setup["founder"]["token"]),
    )
    assert stream.status_code == 200, stream.get_data(as_text=True)
    data = stream.get_json()["data"]
    assert any(row["type"] == "stock.split" and row["aggregate"] == "EVT1" for row in data["events"])
    assert data["next_since"] >= 1


def test_admin_endpoints_are_admin_only(client, test_dsn):
    plain = _player(client, "not-admin")
    for path in ("/api/v1/admin/audit", "/api/v1/admin/jobs/runs", "/api/v1/admin/dlq"):
        response = client.get(path, headers=bearer(plain["token"]))
        assert response.status_code == 403, (path, response.get_data(as_text=True))


def test_halt_and_resume_round_trip(client, test_dsn):
    setup = _listed(client, test_dsn, ticker="HALT1", device="halt-founder")
    admin = _player(client, "halt-admin")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts a SET role = 'admin' FROM players p "
            " WHERE p.account_id = a.id AND p.id = %s",
            (admin["id"],),
        )

    halted = client.post(
        "/api/v1/admin/stocks/HALT1/halt",
        json={"minutes": 30, "reason": "异常波动"},
        headers={**_headers(admin["token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert halted.status_code == 200, halted.get_data(as_text=True)
    assert halted.get_json()["data"]["halted_until"] is not None

    resumed = client.post(
        "/api/v1/admin/stocks/HALT1/resume",
        json={},
        headers={**_headers(admin["token"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert resumed.status_code == 200, resumed.get_data(as_text=True)
    assert resumed.get_json()["data"]["halted_until"] is None
    del setup
