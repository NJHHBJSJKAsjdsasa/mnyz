"""Fabricator endpoints (G1): recipe list with live cooldowns, and one run.

``GET /craft`` is a read: it reports each recipe's remaining cooldown and whether
the player can afford it *right now*, so the tab never has to guess. The write is
idempotent — a double-clicked button cannot produce twice for one intent.
"""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import crafting
from ...infra.context import db
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("craft", __name__)


@bp.get("/craft")
@require_auth()
@rate_limit("craft_view", 120, 60)
def craft_view():
    with db().transaction() as conn:
        player = player_repo.get(conn, g.player_id)
        data = crafting.view(conn, player)
    return success(data, int(player["state_version"]))


@bp.post("/craft/<recipe_code>/run")
@require_auth(write=True)
@rate_limit("craft_run", 60, 60)
def craft_run(recipe_code: str):
    payload = {"recipe": recipe_code}
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            cached = ticket.cached
            return success(
                cached,
                int(cached.get("state_version", 0)),
                extra_headers={"Idempotent-Replay": "true"},
            )
        player = player_repo.get(conn, g.player_id)
        result = crafting.run(conn, player, recipe_code)
        finish_idempotency(conn, ticket, 200, result)
    return success(result, int(result["state_version"]))
