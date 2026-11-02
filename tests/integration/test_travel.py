"""Travel authority: quote → commit is a one-shot price, and /state remembers.

Covers docs/frontend-redesign/11-server-authority.md §4.1 / §4.4:

* the server, not the browser, prices a jump;
* one quote can never be charged twice (retries are harmless);
* a quote outlives its TTL → 410 ``quote_expired``;
* a committed jump is visible in ``GET /state.in_flight``;
* ``GET /ship`` derives the 09 §3.1 status ids from live state.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from server.domain.ledger import TxRef, post_transaction
from server.infra.context import db
from tests.helpers import bearer, guest


def _fund(app, player_id: str, **resources: str) -> None:
    with app.app_context():
        with db().transaction() as conn:
            post_transaction(
                conn,
                player_id,
                {code: Decimal(amount) for code, amount in resources.items()},
                TxRef(kind="correction", ref_type="test", ref_id="fund"),
            )


def _quote(client, token: str, *, kind: str = "galaxy", origin=(1000000, 1000000, 1000000), target=(1000400, 1000000, 1000000)):
    return client.post(
        "/api/v1/travel/quote",
        json={
            "kind": kind,
            "origin": {"x": origin[0], "y": origin[1], "z": origin[2]},
            "target": {"x": target[0], "y": target[1], "z": target[2]},
        },
        headers=bearer(token),
    )


def _commit(client, token: str, quote_id: str, key: str | None = None):
    return client.post(
        "/api/v1/travel/commit",
        json={"quote_id": quote_id},
        headers={**bearer(token), "Idempotency-Key": key or str(uuid.uuid4())},
    )


def _balance(app, player_id: str, code: str = "antimatter") -> Decimal:
    with app.app_context():
        with db().connection() as conn:
            row = conn.execute(
                "SELECT balance FROM wallets WHERE player_id = %s AND resource_code = %s",
                (player_id, code),
            ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def test_quote_then_commit_debits_exactly_the_quoted_cost(app, client):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, antimatter="5000", element115="5000", deuterium="5000")
    before = _balance(app, player_id)

    quoted = _quote(client, token)
    assert quoted.status_code == 200, quoted.get_data(as_text=True)
    quote = quoted.get_json()["data"]
    cost = {code: int(amount) for code, amount in quote["cost"].items()}
    assert cost["antimatter"] > 0 and cost["deuterium"] > 0
    assert quote["affordable"] is True
    assert quote["expires_in_ms"] == 30_000

    committed = _commit(client, token, quote["quote_id"])
    assert committed.status_code == 200, committed.get_data(as_text=True)
    travel = committed.get_json()["data"]
    assert travel["status"] == "in_flight"
    assert travel["replayed"] is False
    assert _balance(app, player_id) == before - cost["antimatter"]
    assert _balance(app, player_id, "deuterium") == Decimal(5000) - cost["deuterium"]


def test_same_quote_never_charges_twice(app, client):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, antimatter="5000", element115="5000", deuterium="5000")

    quote = _quote(client, token).get_json()["data"]
    first = _commit(client, token, quote["quote_id"]).get_json()["data"]
    after_first = _balance(app, player_id)

    # A different idempotency key would bypass the HTTP replay cache on purpose:
    # the guard must live in the quote, not in the header.
    second = _commit(client, token, quote["quote_id"]).get_json()["data"]
    assert second["travel_id"] == first["travel_id"]
    assert second["replayed"] is True
    assert _balance(app, player_id) == after_first


def test_expired_quote_is_rejected(app, client, db_conn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, antimatter="5000", element115="5000", deuterium="5000")

    quote = _quote(client, token).get_json()["data"]
    db_conn.execute(
        "UPDATE travel_quotes SET expires_at = now() - interval '1 second' WHERE id = %s",
        (quote["quote_id"],),
    )
    db_conn.commit()

    response = _commit(client, token, quote["quote_id"])
    assert response.status_code == 410
    assert response.get_json()["code"] == "quote_expired"


def test_committed_jump_shows_up_in_state_in_flight(app, client):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    _fund(app, player_id, antimatter="5000", element115="5000", deuterium="5000")

    quote = _quote(client, token).get_json()["data"]
    travel = _commit(client, token, quote["quote_id"]).get_json()["data"]

    state = client.get("/api/v1/state", headers=bearer(token)).get_json()["data"]
    assert state["ship"]["shield"] == state["ship"]["shield_max"]
    flights = state["in_flight"]
    assert [item["travel_id"] for item in flights] == [travel["travel_id"]]
    assert flights[0]["to"] == {"x": 1000400, "y": 1000000, "z": 1000000}


def test_quote_reports_shortfall_instead_of_failing(app, client):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]

    quote = _quote(client, token).get_json()["data"]
    assert quote["affordable"] is False
    assert set(quote["shortfall"]) == {"antimatter", "element115", "deuterium"}

    response = _commit(client, token, quote["quote_id"])
    assert response.status_code == 409
    assert response.get_json()["code"] == "insufficient_funds"


def test_ship_view_derives_damaged_hull_status(app, client, db_conn):
    data = guest(client)
    token, player_id = data["access_token"], data["player"]["id"]
    db_conn.execute("UPDATE player_flags SET hull = 30 WHERE player_id = %s", (player_id,))
    db_conn.commit()

    body = client.get("/api/v1/ship", headers=bearer(token)).get_json()["data"]
    assert body["hull"] == 30 and body["hull_max"] == 100
    assert body["shield_max"] >= 4
    ids = [status["id"] for status in body["status"]]
    assert "hull.damaged" in ids
    damaged = next(status for status in body["status"] if status["id"] == "hull.damaged")
    assert damaged["severity"] == "degraded" and damaged["payload"]["pct"] == 30


def test_ship_view_flags_empty_fuel_as_critical(app, client):
    data = guest(client)
    token = data["access_token"]

    body = client.get("/api/v1/ship", headers=bearer(token)).get_json()["data"]
    ids = [status["id"] for status in body["status"]]
    assert "fuel.low" in ids
    fuel = next(status for status in body["status"] if status["id"] == "fuel.low")
    assert fuel["severity"] == "critical" and fuel["payload"]["reason"] == "empty"


def test_quote_rejects_coordinates_out_of_range(app, client):
    data = guest(client)
    response = _quote(client, data["access_token"], target=(20_000_000, 1000000, 1000000))
    # pydantic bounds reject it before the handler runs → 400 invalid_argument.
    assert response.status_code == 400
