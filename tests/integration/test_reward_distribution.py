"""Daily issuance reward distribution (01 §4.1 step 3).

The budget is minted into treasury by ``issue_daily``; this job is the only path
that turns it into player balances. Two invariants matter more than the amounts:
total paid never exceeds the budget, and a retry never pays twice.

A brand-new guest has no ``economic_actors`` row (it is created lazily on the
first currency action), so every test materialises the actor first — otherwise
the job correctly reports ``no_active_players``.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.infra.context import db
from server.repo import currency as currency_repo
from tests.helpers import guest


def _ensure_actor(app, player_id: str) -> str:
    with app.app_context():
        with db().transaction() as conn:
            actor = currency_service.actor_for_player(conn, {"id": player_id})
    return str(actor["id"])


def _balance(app, player_id: str, code: str = "cc1") -> Decimal:
    with app.app_context():
        with db().transaction() as conn:
            actor = currency_repo.actor_for_player(conn, player_id)
            if actor is None:
                return Decimal(0)
            row = currency_repo.account(conn, str(actor["id"]), code)
    return Decimal(row["balance"]) if row else Decimal(0)


def test_reward_is_paid_once_per_active_player(app, client, test_dsn):
    data = guest(client)
    player_id = data["player"]["id"]
    _ensure_actor(app, player_id)
    day = date.today() - timedelta(days=1)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE players SET last_seen_at = now() WHERE id = %s", (player_id,))

    with app.app_context():
        with db().transaction() as conn:
            issued = currency_service.issue_daily(conn, day=day, active_players=40, volume_q1=Decimal(0))
        before = _balance(app, player_id)
        with db().transaction() as conn:
            first = currency_service.distribute_daily_reward(conn, day=day)

        assert "skipped" not in first, first
        assert first["recipients"] >= 1
        paid_once = _balance(app, player_id)
        assert paid_once > before
        assert Decimal(first["paid"]) <= Decimal(first["budget"])

        with db().transaction() as conn:
            second = currency_service.distribute_daily_reward(conn, day=day)
        assert second["recipients"] == first["recipients"]
        assert _balance(app, player_id) == paid_once, "重跑不得二次发放"

    assert Decimal(issued["reward_budget"]) > 0


def test_no_issuance_means_no_payout(app, client):
    day = date.today() - timedelta(days=400)
    with app.app_context():
        with db().transaction() as conn:
            result = currency_service.distribute_daily_reward(conn, day=day)
    assert result["skipped"] == "no_issuance"


def test_locked_players_are_skipped(app, client, test_dsn):
    active = guest(client, device_id="reward-active")
    locked = guest(client, device_id="reward-locked")
    _ensure_actor(app, active["player"]["id"])
    _ensure_actor(app, locked["player"]["id"])
    day = date.today() - timedelta(days=2)

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE players SET last_seen_at = now() WHERE id IN (%s, %s)",
            (active["player"]["id"], locked["player"]["id"]),
        )
        conn.execute(
            "UPDATE players SET locked_reason = 'test' WHERE id = %s", (locked["player"]["id"],)
        )

    with app.app_context():
        with db().transaction() as conn:
            currency_service.issue_daily(conn, day=day, active_players=40, volume_q1=Decimal(0))
        with db().transaction() as conn:
            result = currency_service.distribute_daily_reward(conn, day=day)

    assert "skipped" not in result, result
    assert result["recipients"] == 1
    assert _balance(app, locked["player"]["id"]) == 0
    assert _balance(app, active["player"]["id"]) > 0
