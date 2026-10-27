"""Player state endpoints that are not domain actions."""

from __future__ import annotations

from flask import Blueprint, g

from ...domain import state as state_domain
from ...domain.settlement import settle_offline
from ...infra.context import db
from ...repo import players as player_repo
from ..deps import current_player, rate_limit, require_auth, success

bp = Blueprint("session_state", __name__)


@bp.get("/state")
@require_auth()
@rate_limit("state", 60, 60)
def get_state():
    player = current_player()
    with db().transaction() as conn:
        settled = settle_offline(conn, player["id"])
        fresh = player_repo.get(conn, player["id"])
        snapshot = state_domain.compose(conn, fresh)
    snapshot["settlement"] = {
        "settled_at": settled["settled_at"].isoformat() if settled["settled_at"] else None,
    }
    return success(snapshot, int(fresh["state_version"]))


@bp.get("/session")
@require_auth()
def current_session():
    return success({"player_id": str(g.player_id), "session_id": str(g.session_id)})
