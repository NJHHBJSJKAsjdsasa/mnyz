"""Ledger invariants: rollback on insufficient funds, reconciliation, concurrency."""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest

from server.domain.ledger import TxRef, post_transaction
from server.infra.context import db
from server.infra.errors import InsufficientFunds
from server.repo import ledger as ledger_repo
from tests.helpers import collect, guest


def test_insufficient_funds_rolls_back_everything(app, client, db_conn):
    data = guest(client)
    player_id = data["player"]["id"]

    with app.app_context():
        with pytest.raises(InsufficientFunds):
            with db().transaction() as conn:
                post_transaction(
                    conn,
                    player_id,
                    {"antimatter": Decimal("-10")},
                    TxRef(kind="refit", ref_id="scanArray"),
                )

    assert db_conn.execute("SELECT count(*) FROM ledger_transactions").fetchone()[0] == 0
    assert db_conn.execute("SELECT count(*) FROM ledger_entries").fetchone()[0] == 0
    balance = db_conn.execute(
        "SELECT balance FROM wallets WHERE player_id = %s AND resource_code = 'antimatter'",
        (player_id,),
    ).fetchone()[0]
    assert balance == 0


def test_reconciliation_is_clean_after_collect(app, client):
    data = guest(client)
    assert collect(client, data["access_token"]).status_code == 200

    with app.app_context():
        with db().connection() as conn:
            assert ledger_repo.unbalanced_transactions(conn, hours=24) == []
            assert ledger_repo.mismatched_wallets(conn) == []


def test_same_idempotency_key_concurrent(app, client, db_conn):
    data = guest(client)
    token = data["access_token"]
    key = str(uuid.uuid4())
    barrier = threading.Barrier(2)

    def worker():
        with app.test_client() as worker_client:
            barrier.wait(timeout=10)
            return collect(worker_client, token, idem=key)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [future.result() for future in [pool.submit(worker), pool.submit(worker)]]

    assert [r.status_code for r in results] == [200, 200], [r.get_data(as_text=True) for r in results]
    tx_ids = {r.get_json()["data"]["tx_id"] for r in results}
    assert len(tx_ids) == 1
    assert db_conn.execute("SELECT count(*) FROM collections").fetchone()[0] == 1
    assert db_conn.execute("SELECT count(*) FROM ledger_transactions").fetchone()[0] == 1


def test_state_reflects_collect(client):
    data = guest(client)
    result = collect(client, data["access_token"]).get_json()["data"]
    state = client.get("/api/v1/state", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert state.status_code == 200
    payload = state.get_json()["data"]
    for code, amount in result["gained"].items():
        assert payload["resources"][code] == amount
    assert "collect:planet_1,2,3_0_x" in payload["cooldowns"]
    assert state.get_json()["state_version"] == 1
