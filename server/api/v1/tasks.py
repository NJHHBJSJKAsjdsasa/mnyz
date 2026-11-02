"""Daily task and weekly goal endpoints."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import task_service, weekly
from ...infra.context import db
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    check_if_match,
    current_player,
    finish_idempotency,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("tasks", __name__)


@bp.get("/tasks")
@require_auth()
@rate_limit("tasks", 60, 60)
def tasks():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        items = task_service.list_today(conn, player)
    return success({"tasks": items, "state_version": int(player["state_version"])})


@bp.post("/tasks/<task_code>/claim")
@require_auth(write=True)
@rate_limit("task_claim", 30, 60)
def task_claim(task_code: str):
    check_if_match(current_player())
    payload = {"task": task_code}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = task_service.claim(conn, player, task_code)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))


@bp.get("/weekly")
@require_auth()
@rate_limit("weekly", 60, 60)
def weekly_goals():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        data = weekly.snapshot(conn, player)
    return success(data, int(player["state_version"]))


@bp.post("/weekly/claim")
@require_auth(write=True)
@rate_limit("weekly_claim", 10, 60)
def weekly_claim():
    check_if_match(current_player())
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, {"weekly": "claim"})
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(cached, int(cached.get("state_version", 0)), extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        result = weekly.claim(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))
