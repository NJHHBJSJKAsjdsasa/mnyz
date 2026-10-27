"""Cosmic council: AI seats, player seats, sector motions and votes."""

from __future__ import annotations

import uuid

from tests.helpers import bearer, guest


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _close_motion(db_conn, motion_id: str) -> None:
    db_conn.execute(
        "UPDATE council_motions SET closes_at = now() - interval '1 second' WHERE id = %s",
        (motion_id,),
    )


def test_council_sector_and_membership_motions(client, db_conn):
    data = guest(client, "council-member")
    token = data["access_token"]
    player_id = data["player"]["id"]
    db_conn.execute(
        "UPDATE wallets SET balance = 100000 WHERE player_id = %s AND resource_code = 'antimatter'",
        (player_id,),
    )

    council = client.get("/api/v1/council", headers=bearer(token))
    assert council.status_code == 200, council.get_data(as_text=True)
    body = council.get_json()["data"]
    assert len(body["seats"]) == 7
    assert sum(1 for seat in body["seats"] if seat["is_ai"]) == 5
    assert body["my_seat"] is None

    applied = client.post(
        "/api/v1/council/sector-license",
        json={"sector_key": "9-9-9"},
        headers=_headers(token),
    )
    assert applied.status_code == 200, applied.get_data(as_text=True)
    motion_id = applied.get_json()["data"]["motion"]["id"]
    # AI seats vote in the same call; the split depends on the seeded RNG, so only
    # assert that votes exist (a `yes >= 1` check made this test ~14% flaky).
    assert applied.get_json()["data"]["motion"]["yes"] + applied.get_json()["data"]["motion"]["no"] >= 1

    # Force a unanimous council so the test is deterministic.
    db_conn.execute(
        "UPDATE council_votes SET vote = 'yes' WHERE motion_id = %s", (motion_id,)
    )
    _close_motion(db_conn, motion_id)
    resolved = client.get("/api/v1/council", headers=bearer(token)).get_json()["data"]
    motion = next(item for item in resolved["motions"] if item["id"] == motion_id)
    assert motion["status"] == "passed"
    assert db_conn.execute(
        "SELECT 1 FROM sector_licenses WHERE player_id = %s AND sector_key = '9-9-9'",
        (player_id,),
    ).fetchone()

    seat = client.post("/api/v1/council/seat", json={}, headers=_headers(token))
    assert seat.status_code == 200, seat.get_data(as_text=True)
    seat_motion = seat.get_json()["data"]["motion"]["id"]
    db_conn.execute(
        "UPDATE council_votes SET vote = 'yes' WHERE motion_id = %s", (seat_motion,)
    )
    _close_motion(db_conn, seat_motion)
    joined = client.get("/api/v1/council", headers=bearer(token)).get_json()["data"]
    assert joined["my_seat"] in {6, 7}
    assert any(item["id"] == seat_motion and item["status"] == "passed" for item in joined["motions"])

    another = client.post(
        "/api/v1/council/sector-license",
        json={"sector_key": "9-9-8"},
        headers=_headers(token),
    )
    assert another.status_code == 200, another.get_data(as_text=True)
    voted = client.post(
        f"/api/v1/council/motions/{another.get_json()['data']['motion']['id']}/vote",
        json={"vote": "yes"},
        headers=_headers(token),
    )
    assert voted.status_code == 200, voted.get_data(as_text=True)
    assert any(row["seat_no"] == joined["my_seat"] for row in voted.get_json()["data"]["motion"]["votes"])
