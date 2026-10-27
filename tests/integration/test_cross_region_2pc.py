"""Cross-region 2PC: inline no-op, fee model, budget, lease takeover, unknown SLA."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import dt_coordinator

TOKEN = "test-internal-token"
BASE = "/api/v1/internal/dt"


def _h(key: str | None = None) -> dict[str, str]:
    headers = {"X-Internal-Token": TOKEN}
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _begin(client, **body):
    payload = {"kind": "transfer", "participants": [], "origin_region": "core"}
    payload.update(body)
    return client.post(f"{BASE}/begin", json=payload, headers=_h())


def test_same_region_is_inline_noop(client, test_dsn):
    response = _begin(
        client,
        participants=[{"participant_id": "wallet-a", "region": "core"}],
        notional="100",
        currency_code="cc1",
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    assert data["status"] == "committed"
    assert data["fee_bps"] == 0
    assert Decimal(data["fee_amount"]) == 0
    assert data["participants"][0]["status"] == "committed"
    assert data["decisions"][0]["decision"] == "commit"
    assert data["outbox"][0]["event_type"] == "dt.committed"
    assert data["decided_at"]


def test_cross_region_fee_and_split(client, test_dsn):
    response = _begin(
        client,
        participants=[
            {"participant_id": "wallet-a", "region": "core"},
            {"participant_id": "listing-b", "region": "rim"},
        ],
        origin_region="core",
        notional="1000",
        currency_code="cc1",
        asset_class="stock",
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()["data"]
    # adjacent 5bp + stock risk premium 2bp = 7bp; 1000 * 7/10000 = 0.7
    assert data["fee_bps"] == 7
    assert Decimal(data["fee_amount"]) == Decimal("0.7")
    split = data["fee_split"]
    assert Decimal(split["coordinator"]) == Decimal("0.28")
    assert Decimal(split["origin"]) == Decimal("0.21")
    assert Decimal(split["asset_region"]) == Decimal("0.14")
    assert Decimal(split["fund"]) == Decimal("0.07")
    assert data["status"] == "committed"


def test_defer_prepare_then_commit(client, test_dsn):
    created = _begin(
        client,
        participants=[
            {"participant_id": "wallet-a", "region": "core"},
            {"participant_id": "listing-b", "region": "rim"},
        ],
        notional="500",
        currency_code="cc1",
        defer=True,
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    tx = created.get_json()["data"]
    tx_id = tx["tx_id"]
    assert tx["status"] == "preparing"

    first = client.post(
        f"{BASE}/{tx_id}/prepare",
        json={"participant_id": "wallet-a", "coordinator_id": "c-1"},
        headers=_h(),
    )
    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json()["data"]["status"] == "preparing"

    second = client.post(
        f"{BASE}/{tx_id}/prepare",
        json={"participant_id": "listing-b", "coordinator_id": "c-1"},
        headers=_h(),
    )
    assert second.get_json()["data"]["status"] == "prepared"

    committed = client.post(f"{BASE}/{tx_id}/commit", json={"coordinator_id": "c-1"}, headers=_h())
    assert committed.status_code == 200, committed.get_data(as_text=True)
    body = committed.get_json()["data"]
    assert body["status"] == "committed"
    assert {item["status"] for item in body["participants"]} == {"committed"}

    again = client.post(f"{BASE}/{tx_id}/commit", json={"coordinator_id": "c-1"}, headers=_h())
    assert again.get_json()["data"]["replayed"] is True


def test_abort_refunds_fee_and_blocks_late_abort(client, test_dsn):
    tx = _begin(
        client,
        participants=[
            {"participant_id": "wallet-a", "region": "core"},
            {"participant_id": "outer-c", "region": "rim"},
        ],
        notional="2000",
        defer=True,
    ).get_json()["data"]
    tx_id = tx["tx_id"]
    assert Decimal(tx["fee_amount"]) > 0
    client.post(f"{BASE}/{tx_id}/prepare", json={"participant_id": "wallet-a"}, headers=_h())

    aborted = client.post(
        f"{BASE}/{tx_id}/abort", json={"reason": "insufficient funds"}, headers=_h()
    )
    assert aborted.status_code == 200, aborted.get_data(as_text=True)
    body = aborted.get_json()["data"]
    assert body["status"] == "aborted"
    assert Decimal(body["fee_amount"]) == 0
    assert body["decisions"][-1]["decision"] == "abort"
    assert body["outbox"][-1]["event_type"] == "dt.aborted"

    committed = _begin(
        client,
        participants=[{"participant_id": "wallet-a", "region": "core"}],
    ).get_json()["data"]
    late = client.post(f"{BASE}/{committed['tx_id']}/abort", json={}, headers=_h())
    assert late.status_code == 422


def test_budget_rejects_remote_region(client, test_dsn):
    response = _begin(
        client,
        participants=[{"participant_id": "outer-c", "region": "outer"}],
        origin_region="core",
    )
    assert response.status_code == 422
    assert "5s" in response.get_json()["detail"]


def test_idempotency_key_maps_to_same_tx(client, test_dsn):
    key = str(uuid.uuid4())
    body = {
        "kind": "transfer",
        "participants": [{"participant_id": "wallet-a", "region": "core"}],
        "origin_region": "core",
        "notional": "10",
        "currency_code": "cc1",
    }
    first = client.post(f"{BASE}/begin", json=body, headers=_h(key))
    second = client.post(f"{BASE}/begin", json=body, headers=_h(key))
    assert first.status_code == 200 and second.status_code == 200
    one = first.get_json()["data"]
    two = second.get_json()["data"]
    assert one["tx_id"] == two["tx_id"]
    assert two["replayed"] is True


def test_recovery_takes_over_lease_and_aborts_stale(client, test_dsn):
    tx = _begin(
        client,
        participants=[{"participant_id": "wallet-a", "region": "core"}],
        defer=True,
    ).get_json()["data"]
    tx_id = tx["tx_id"]
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE distributed_transactions SET created_at = now() - interval '6 seconds', "
            "deadline_at = now() - interval '1 second' WHERE id = %s",
            (tx_id,),
        )
        conn.execute(
            "UPDATE dt_coordinator_lease SET lease_until = now() - interval '1 second' "
            "WHERE tx_id = %s",
            (tx_id,),
        )
        result = dt_coordinator.recover(conn, coordinator_id="dt-recovery-test")
        row = conn.execute(
            "SELECT status FROM distributed_transactions WHERE id = %s", (tx_id,)
        ).fetchone()
        lease = conn.execute(
            "SELECT coordinator_id FROM dt_coordinator_lease WHERE tx_id = %s", (tx_id,)
        ).fetchone()
    assert result["taken_over"] >= 1
    assert row["status"] == "aborted"
    assert lease["coordinator_id"] == "dt-recovery-test"


def test_unknown_sla_and_two_person_resolution(client, test_dsn):
    tx = _begin(
        client,
        participants=[{"participant_id": "wallet-a", "region": "core"}],
        defer=True,
    ).get_json()["data"]
    tx_id = tx["tx_id"]
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE distributed_transactions SET status = 'committing', "
            "created_at = now() - interval '9 seconds', deadline_at = now() - interval '4 seconds' "
            "WHERE id = %s",
            (tx_id,),
        )
        result = dt_coordinator.recover(conn, coordinator_id="dt-recovery-test")
        row = conn.execute(
            "SELECT status FROM distributed_transactions WHERE id = %s", (tx_id,)
        ).fetchone()
    assert result["unknown"] >= 1
    assert row["status"] == "unknown"

    same = client.post(
        f"{BASE}/{tx_id}/resolve",
        json={"decision": "commit", "decided_by": "ops-a", "reviewer": "ops-a"},
        headers=_h(),
    )
    assert same.status_code == 403

    resolved = client.post(
        f"{BASE}/{tx_id}/resolve",
        json={"decision": "commit", "decided_by": "ops-a", "reviewer": "ops-b",
              "reason": "对账确认已提交"},
        headers=_h(),
    )
    assert resolved.status_code == 200, resolved.get_data(as_text=True)
    body = resolved.get_json()["data"]
    assert body["status"] == "committed"
    assert body["decisions"][-1]["decision"] == "heuristic_commit"
    assert body["resolved_by"] == "ops-a/ops-b"


def test_internal_endpoint_requires_token(client, test_dsn):
    missing = client.post(
        f"{BASE}/begin",
        json={"kind": "transfer", "participants": [{"participant_id": "w", "region": "core"}]},
    )
    assert missing.status_code == 403

    wrong = client.post(
        f"{BASE}/begin",
        json={"kind": "transfer", "participants": [{"participant_id": "w", "region": "core"}]},
        headers={"X-Internal-Token": "nope"},
    )
    assert wrong.status_code == 403

    stats = client.get(f"{BASE}/stats", headers=_h())
    assert stats.status_code == 200
    assert "by_status" in stats.get_json()["data"]
